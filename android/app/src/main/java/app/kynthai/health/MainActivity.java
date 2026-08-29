package app.kynthai.health;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import android.webkit.CookieManager;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Android 12+ sticks on the green splash unless SplashScreen is installed and
 * postSplashScreenTheme is set. We also force-dismiss after a short timeout so a
 * slow network never leaves the user on a blank green screen forever.
 */
public class MainActivity extends BridgeActivity {
  private static final int REQ_NOTIFICATIONS = 1001;
  private boolean keepSplash = true;

  /**
   * MUST match the channelId the server sends in every FCM message
   * (src/lib/push-server.ts → android.notification.channelId).
   * Without this channel the FCM SDK drops pushes into its silent
   * "Miscellaneous" fallback — notifications arrived with NO sound.
   * Same soft chime + vibration as the local exact-alarm channel
   * (DoseAlarmReceiver.CHANNEL_ID = kynthai_dose_chime_v3).
   */
  private static final String FCM_CHANNEL_ID = "kynthai_dose_alarm";

  private void ensureFcmNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(FCM_CHANNEL_ID) != null) return;
    NotificationChannel ch = new NotificationChannel(
        FCM_CHANNEL_ID,
        "Medication reminders",
        NotificationManager.IMPORTANCE_HIGH);
    ch.setDescription("Dose reminders that arrive while Kynthai is closed");
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[]{0, 200, 120, 200});
    try {
      Uri chime = Uri.parse(
          "android.resource://" + getPackageName() + "/" + R.raw.med_chime);
      AudioAttributes aa = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build();
      ch.setSound(chime, aa);
    } catch (Exception ignored) {
      /* channel still created with the system default sound */
    }
    nm.createNotificationChannel(ch);
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen splash = SplashScreen.installSplashScreen(this);
    splash.setKeepOnScreenCondition(() -> keepSplash);

    registerPlugin(DoseAlarmPlugin.class);
    super.onCreate(savedInstanceState);

    // Dismiss system splash as soon as the activity is up (WebView can load underneath).
    keepSplash = false;

    // Sound-enabled channel for server-push (FCM) dose reminders — create
    // before the first push can arrive (channel settings are immutable once
    // created by an arriving notification's fallback).
    ensureFcmNotificationChannel();

    // Safety net: if anything re-shows a splash layer, clear after 2.5s.
    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      keepSplash = false;
      try {
        if (getBridge() != null && getBridge().getWebView() != null) {
          getBridge().getWebView().requestFocus();
        }
      } catch (Exception ignored) {}
    }, 2500);

    requestNotificationPermissionIfNeeded();

    // FCM token registration — runs from native Java, independent of remote web page timing.
    // Posts the token directly to the server using session cookies from CookieManager.
    // This bypasses the web bridge timing issue where PushNotifications.register() fails
    // because the Capacitor bridge isn't ready when the remote-loaded page runs.
    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      FirebaseMessaging.getInstance().getToken()
        .addOnSuccessListener(token -> {
          if (token == null || token.isEmpty()) return;
          Log.d("MainActivity", "FCM token obtained: " + token.substring(0, Math.min(20, token.length())) + "...");
          // POST token to server in background thread
          new Thread(() -> {
            try {
              String cookie = CookieManager.getInstance().getCookie("https://kynthai.app");
              URL url = new URL("https://kynthai.app/api/notifications/fcm-register");
              HttpURLConnection conn = (HttpURLConnection) url.openConnection();
              conn.setRequestMethod("POST");
              conn.setRequestProperty("Content-Type", "application/json");
              conn.setRequestProperty("Accept", "application/json");
              if (cookie != null && !cookie.isEmpty()) {
                conn.setRequestProperty("Cookie", cookie);
              }
              conn.setDoOutput(true);
              // Server resolves the user from the session cookies sent above.
              // Do NOT hardcode an email — that registered every install under
              // one demo account. Body carries only the token.
              String body = "{\"token\":\"" + token + "\"}";
              OutputStream os = conn.getOutputStream();
              os.write(body.getBytes("UTF-8"));
              os.close();
              int code = conn.getResponseCode();
              String resp = new String(conn.getInputStream().readAllBytes(), "UTF-8");
              Log.d("MainActivity", "FCM register POST " + code + ": " + resp.substring(0, Math.min(100, resp.length())));
              conn.disconnect();
            } catch (Exception e) {
              Log.e("MainActivity", "FCM register failed: " + e.getMessage());
            }
          }).start();
        })
        .addOnFailureListener(e -> Log.e("MainActivity", "FCM getToken failed: " + e.getMessage()));
    }, 8000); // 8s delay to let WebView load + user login + cookies settle
  }

  private void requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < 33) return;
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED) {
      return;
    }
    ActivityCompat.requestPermissions(
        this,
        new String[] { Manifest.permission.POST_NOTIFICATIONS },
        REQ_NOTIFICATIONS
    );
  }
}
