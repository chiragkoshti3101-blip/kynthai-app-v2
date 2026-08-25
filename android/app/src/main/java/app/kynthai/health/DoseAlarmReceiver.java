package app.kynthai.health;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Fires exact-alarm medication notifications with the in-app clinical chime
 * (res/raw/med_chime), not the harsh system TYPE_ALARM tone.
 */
public class DoseAlarmReceiver extends BroadcastReceiver {
  public static final String ACTION_DOSE = "app.kynthai.health.ACTION_DOSE_ALARM";
  /** New channel id so devices do not keep an old channel locked to TYPE_ALARM sound */
  private static final String CHANNEL_ID = "kynthai_dose_chime_v3";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    ensureChannel(context);

    String title = intent.getStringExtra("title");
    String body = intent.getStringExtra("body");
    int notifId = intent.getIntExtra("notifId", (int) (System.currentTimeMillis() % 100000));
    if (title == null || title.trim().isEmpty()) title = "Medication reminder";
    if (body == null || body.trim().isEmpty()) body = "Time to take your medication";

    Intent full = new Intent(context, FullScreenAlarmActivity.class);
    full.putExtra("title", title);
    full.putExtra("body", body);
    full.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent fullPi = PendingIntent.getActivity(
      context,
      notifId,
      full,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Intent open = new Intent(context, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    open.putExtra("alarm", true);
    PendingIntent contentPi = PendingIntent.getActivity(
      context,
      notifId + 1,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );

    Uri chime = Uri.parse(
      "android.resource://" + context.getPackageName() + "/" + R.raw.med_chime
    );

    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setSound(chime)
      .setContentIntent(contentPi)
      .setFullScreenIntent(fullPi, true);

    try {
      NotificationManagerCompat.from(context).notify(notifId, builder.build());
    } catch (SecurityException ignored) {
      /* permission denied */
    }
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

    NotificationChannel ch = new NotificationChannel(
      CHANNEL_ID,
      "Medication reminders",
      NotificationManager.IMPORTANCE_HIGH
    );
    ch.setDescription("Soft clinical chime for dose reminders");
    ch.enableVibration(true);
    ch.setVibrationPattern(new long[] { 0, 200, 120, 200 });
    Uri chime = Uri.parse(
      "android.resource://" + context.getPackageName() + "/" + R.raw.med_chime
    );
    AudioAttributes aa = new AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build();
    ch.setSound(chime, aa);
    nm.createNotificationChannel(ch);
  }
}
