package app.kynthai.health;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
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
import org.json.JSONArray;
import org.json.JSONObject;
import android.content.SharedPreferences;

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
      scheduleExactOrInexact(am, trigger, pi);
      JSObject ret = new JSObject();
      ret.put("scheduled", true);
      ret.put("id", id);
      ret.put("atMs", trigger);
      persistAlarm(id, title, body, trigger);
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

  /**
   * Native-side FCM token registration — called from Java, not from the remote
   * page's JS. Bypasses the timing issue where PushNotifications.register() fails
   * silently in the Capacitor WebView.
   */
  @PluginMethod
  public void registerFcmToken(PluginCall call) {
    String token = call.getString("token");
    if (token == null || token.length() < 20) {
      call.reject("Missing or invalid FCM token");
      return;
    }
    // Store token locally for persistence across restarts
    try {
      SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      sp.edit().putString("fcm_token", token).apply();
    } catch (Exception ignored) {}

    // Notify JS layer (if bridge is up) so it can POST to server
    JSObject data = new JSObject();
    data.put("token", token);
    notifyListeners("fcmTokenAvailable", data);
    call.resolve(data);
  }

  /**
   * Read the FCM token stored in SharedPreferences by MainActivity
   * or by registerFcmToken(). Called from fcm.ts as a fallback when
   * the PushNotifications plugin isn't available.
   */
  @PluginMethod
  public void getFcmToken(PluginCall call) {
    String token = null;
    // Check SharedPreferences first (written by MainActivity or registerFcmToken)
    try {
      SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      token = sp.getString("fcm_token", null);
    } catch (Exception ignored) {}

    // Fallback: check the KynthaiFCM prefs file (written by MainActivity)
    if (token == null) {
      try {
        SharedPreferences sp = getContext().getSharedPreferences("KynthaiFCM", Context.MODE_PRIVATE);
        token = sp.getString("fcm_token", null);
      } catch (Exception ignored) {}
    }

    JSObject data = new JSObject();
    data.put("token", token);
    data.put("found", token != null && token.length() > 20);
    call.resolve(data);
  }

  /**
   * Open Android system notification settings for this app.
   * Opens system screen so user can turn allowNoti=true when previously denied.
   */
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

  /**
   * Report whether this app may schedule *exact* alarms. On Android 12/12L
   * SCHEDULE_EXACT_ALARM is a special access the user must enable; when it is
   * off, canScheduleExactAlarms() is false and doses fall back to inexact
   * alarms that Doze can delay. Android 13+ grants USE_EXACT_ALARM at install
   * for alarm/reminder apps, so this reports true without a prompt there.
   */
  @PluginMethod
  public void canScheduleExactAlarms(PluginCall call) {
    boolean granted;
    if (Build.VERSION.SDK_INT >= 31) {
      AlarmManager am =
          (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
      granted = am != null && am.canScheduleExactAlarms();
    } else {
      granted = true; // exact alarms are a normal capability below API 31
    }
    JSObject ret = new JSObject();
    ret.put("granted", granted);
    ret.put("sdk", Build.VERSION.SDK_INT);
    call.resolve(ret);
  }

  /** Open the system screen where the user can allow exact alarms. */
  @PluginMethod
  public void openExactAlarmSettings(PluginCall call) {
    try {
      Context ctx = getContext();
      Intent intent;
      if (Build.VERSION.SDK_INT >= 31) {
        intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
      } else {
        intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
      JSObject ret = new JSObject();
      ret.put("opened", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("openExactAlarmSettings failed: " + e.getMessage());
    }
  }

  /**
   * Report whether full-screen intents are permitted. Android 14+ can deny
   * USE_FULL_SCREEN_INTENT, which downgrades the alarm takeover to a plain
   * notification with no lock-screen takeover.
   */
  @PluginMethod
  public void canUseFullScreenIntent(PluginCall call) {
    boolean granted;
    if (Build.VERSION.SDK_INT >= 34) {
      NotificationManager nm =
          (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
      granted = nm != null && nm.canUseFullScreenIntent();
    } else {
      granted = true;
    }
    JSObject ret = new JSObject();
    ret.put("granted", granted);
    ret.put("sdk", Build.VERSION.SDK_INT);
    call.resolve(ret);
  }

  /** Open the system screen where the user can allow full-screen notifications. */
  @PluginMethod
  public void openFullScreenIntentSettings(PluginCall call) {
    try {
      Context ctx = getContext();
      Intent intent;
      if (Build.VERSION.SDK_INT >= 34) {
        intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
        // The settings screen needs the package to know which app to show.
        intent.setData(Uri.parse("package:" + ctx.getPackageName()));
      } else {
        intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      ctx.startActivity(intent);
      JSObject ret = new JSObject();
      ret.put("opened", true);
      call.resolve(ret);
    } catch (Exception e) {
      call.reject("openFullScreenIntentSettings failed: " + e.getMessage());
    }
  }

  private static final String PREFS = "kynthai_dose_alarms";

  private void persistAlarm(int id, String title, String body, long atMs) {
    try {
      SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      JSONArray arr;
      try { arr = new JSONArray(sp.getString("items", "[]")); } catch (Exception e) { arr = new JSONArray(); }
      JSONArray next = new JSONArray();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o != null && o.optInt("id") != id) next.put(o);
      }
      JSONObject o = new JSONObject();
      o.put("id", id);
      o.put("title", title);
      o.put("body", body);
      o.put("atMs", atMs);
      next.put(o);
      sp.edit().putString("items", next.toString()).apply();
    } catch (Exception ignored) {}
  }

  public static void restoreAlarms(Context ctx) {
    try {
      SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      JSONArray arr = new JSONArray(sp.getString("items", "[]"));
      AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
      if (am == null) return;
      long now = System.currentTimeMillis();
      for (int i = 0; i < arr.length(); i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        long at = o.optLong("atMs");
        if (at < now) continue;
        int id = o.optInt("id");
        Intent intent = new Intent(ctx, DoseAlarmReceiver.class);
        intent.setAction(DoseAlarmReceiver.ACTION_DOSE);
        intent.putExtra("title", o.optString("title", "Medication reminder"));
        intent.putExtra("body", o.optString("body", "Time to take your medication"));
        intent.putExtra("notifId", id);
        PendingIntent pi = PendingIntent.getBroadcast(
          ctx, id, intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        scheduleExactOrInexact(am, at, pi);
      }
    } catch (Exception ignored) {}
  }

  /**
   * Schedule an exact dose alarm when possible, falling back to an inexact
   * alarm otherwise. setExactAndAllowWhileIdle() throws SecurityException on
   * Android 12+ (API 31+) when the SCHEDULE_EXACT_ALARM "special app access"
   * is not granted; without this guard a missing grant silently killed every
   * reminder. canScheduleExactAlarms() only exists on API 31+, so feature-detect.
   */
  private static void scheduleExactOrInexact(AlarmManager am, long trigger, PendingIntent pi) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      boolean canExact = Build.VERSION.SDK_INT >= 31 && am.canScheduleExactAlarms();
      if (canExact) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
      } else {
        // Inexact fallback so the dose still fires absent the grant (a few
        // minutes of Doze delay is far better than never firing).
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pi);
      }
    } else {
      am.setExact(AlarmManager.RTC_WAKEUP, trigger, pi);
    }
  }

  @PluginMethod
  public void restore(PluginCall call) {
    try {
      restoreAlarms(getContext());
      call.resolve();
    } catch (Exception e) {
      call.reject("restore failed: " + e.getMessage());
    }
  }
}
