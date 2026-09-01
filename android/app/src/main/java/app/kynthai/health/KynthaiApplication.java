package app.kynthai.health;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Creates the FCM channel at process start, including when Android starts the
 * app only to display a background notification. MainActivity also calls this
 * defensively, but the Application hook prevents the first push from falling
 * back to Android's silent miscellaneous channel.
 */
public class KynthaiApplication extends Application {
  public static final String FCM_CHANNEL_ID = "kynthai_dose_alarm";

  @Override
  public void onCreate() {
    super.onCreate();
    ensureFcmNotificationChannel(this);
  }

  public static void ensureFcmNotificationChannel(Application app) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = app.getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(FCM_CHANNEL_ID) != null) return;

    NotificationChannel channel = new NotificationChannel(
        FCM_CHANNEL_ID,
        "Medication reminders",
        NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Dose reminders that arrive while Kynthai is closed");
    channel.enableVibration(true);
    channel.setVibrationPattern(new long[]{0, 200, 120, 200});
    try {
      Uri chime = Uri.parse(
          "android.resource://" + app.getPackageName() + "/" + R.raw.med_chime);
      AudioAttributes attributes = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build();
      channel.setSound(chime, attributes);
    } catch (Exception ignored) {
      // Keep the channel alive with Android's default notification sound.
    }
    manager.createNotificationChannel(channel);
  }
}
