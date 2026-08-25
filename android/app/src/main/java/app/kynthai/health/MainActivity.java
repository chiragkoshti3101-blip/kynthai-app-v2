package app.kynthai.health;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Requests notification + alarm-related permissions on first launch (Android 13+).
 * Without this, users never see "Allow notifications" and closed-app alerts fail.
 */
public class MainActivity extends BridgeActivity {
  private static final int REQ_NOTIFICATIONS = 1001;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DoseAlarmPlugin.class);
    super.onCreate(savedInstanceState);
    requestNotificationPermissionIfNeeded();
  }

  private void requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < 33) {
      return;
    }
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
