package app.kynthai.health;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS API: DoseAlarm.schedule({ id, title, body, atMs })
 * Schedules an exact alarm that opens FullScreenAlarmActivity over other apps.
 */
@CapacitorPlugin(name = "DoseAlarm")
public class DoseAlarmPlugin extends Plugin {

  @PluginMethod
  public void schedule(PluginCall call) {
    Integer id = call.getInt("id");
    String title = call.getString("title", "Medication alarm");
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
      ctx,
      id,
      intent,
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
      ctx,
      id,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
    if (am != null) am.cancel(pi);
    call.resolve();
  }
}
