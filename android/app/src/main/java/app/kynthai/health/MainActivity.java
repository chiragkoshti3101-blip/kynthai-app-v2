package app.kynthai.health;

import android.Manifest;
import android.content.pm.PackageManager;
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

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen splash = SplashScreen.installSplashScreen(this);
    splash.setKeepOnScreenCondition(() -> keepSplash);

    registerPlugin(DoseAlarmPlugin.class);
    super.onCreate(savedInstanceState);

    // Dismiss system splash as soon as the activity is up (WebView can load underneath).
    keepSplash = false;

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
              String body = "{\"token\":\"" + token + "\",\"email\":\"patient@kynthai.app\"}";
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
