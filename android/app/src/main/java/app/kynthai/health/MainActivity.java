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
    // When the app opens, this gets the Firebase device token and stores it in
    // SharedPreferences so the web layer can POST it to the server when the bridge
    // is ready with proper auth cookies.
    new Handler(Looper.getMainLooper()).postDelayed(() -> {
      FirebaseMessaging.getInstance().getToken()
        .addOnSuccessListener(token -> {
          if (token == null || token.isEmpty()) return;
          Log.d("MainActivity", "FCM token obtained: " + token.substring(0, Math.min(20, token.length())) + "...");
          // Store in SharedPreferences so fcm.ts can read it via Capacitor Preferences
          try {
            getSharedPreferences("KynthaiFCM", MODE_PRIVATE)
              .edit().putString("fcm_token", token).apply();
          } catch (Exception e) {
            Log.e("MainActivity", "Failed to store FCM token in prefs: " + e.getMessage());
          }
        })
        .addOnFailureListener(e -> Log.e("MainActivity", "FCM getToken failed: " + e.getMessage()));
    }, 5000); // 5s delay to let the bridge fully initialize
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
