package app.kynthai.health;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arm exact dose alarms after reboot / app update. */
public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String a = intent.getAction();
    if (Intent.ACTION_BOOT_COMPLETED.equals(a)
        || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(a)
        || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
      DoseAlarmPlugin.restoreAlarms(context);
    }
  }
}
