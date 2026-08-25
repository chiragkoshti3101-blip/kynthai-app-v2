package app.kynthai.health;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DoseAlarm")
public class DoseAlarmPlugin extends Plugin {

  @PluginMethod
  public void schedule(PluginCall call) {
    Integer id = call.getInt("id");
    String title = call.getString("title", "Medication reminder");
    String body = call.getString("body", "Time to take your medication");
    Double atMs = call.getDouble("atMs");
    if (id == null || atMs == null) {
      call.reject("id and atMs required");
      return;
    }

    Context ctx = getContext();
    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    if (am == null) {
      call.reject("AlarmManager unavailable");
      return;
    }

    Intent intent = new Intent(ctx, DoseAlarmReceiver.class);
    intent.setAction(DoseAlarmReceiver.ACTION_DOSE);
    intent.putExtra("title", title);
    intent.putExtra("body", body);
    intent.putExtra("notifId", id);

    PendingIntent pi = PendingIntent.getBroadcast(
      ctx, id, intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    long trigger = atMs.longValue();
    if (trigger < System.currentTimeMillis() + 2000) {
      trigger = System.currentTimeMillis() + 2000;
    }

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
      } else {
        am.setExact(AlarmManager.RTC_WAKEUP, trigger, pi);
      }
      JSObject ret = new JSObject();
      ret.put("scheduled", true);
      ret.put("id", id);
      ret.put("atMs", trigger);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("schedule failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    Integer id = call.getInt("id");
    if (id == null) {
      call.reject("id required");
      return;
    }
    Context ctx = getContext();
    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    Intent intent = new Intent(ctx, DoseAlarmReceiver.class);
    intent.setAction(DoseAlarmReceiver.ACTION_DOSE);
    PendingIntent pi = PendingIntent.getBroadcast(
      ctx, id, intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    if (am != null) am.cancel(pi);
    call.resolve();
  }

  @PluginMethod
  public void requestPermissions(PluginCall call) {
    if (Build.VERSION.SDK_INT < 33) {
      JSObject ret = new JSObject();
      ret.put("granted", true);
      ret.put("reason", "pre_tiramisu");
      call.resolve(ret);
      return;
    }
    boolean granted =
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED;
    if (!granted && getActivity() != null) {
      ActivityCompat.requestPermissions(
        getActivity(),
        new String[] { Manifest.permission.POST_NOTIFICATIONS },
        1001
      );
    }
    JSObject ret = new JSObject();
    ret.put("granted", granted);
    ret.put("reason", granted ? "granted" : "prompted_or_denied");
    call.resolve(ret);
  }

  /** Opens system screen so user can turn allowNoti=true when previously denied. */
  @PluginMethod
  public void openNotificationSettings(PluginCall call) {
    try {
      Context ctx = getContext();
      Intent intent = new Intent();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
      } else {
        intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("openNotificationSettings failed: " + e.getMessage());
    }
  }
}
