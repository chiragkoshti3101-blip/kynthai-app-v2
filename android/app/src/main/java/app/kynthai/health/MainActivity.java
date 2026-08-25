package app.kynthai.health;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

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
