package app.kynthai.health;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.graphics.Color;
import android.view.Gravity;
import android.util.TypedValue;

/**
 * Full-phone takeover for medication / emergency alarms.
 * Shown via full-screen intent even when another app is in the foreground.
 */
public class FullScreenAlarmActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
      KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
      if (km != null) {
        km.requestDismissKeyguard(this, null);
      }
    } else {
      getWindow().addFlags(
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
          | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
          | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      );
    }
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    String title = getIntent().getStringExtra("title");
    String body = getIntent().getStringExtra("body");
    if (title == null) title = "Medication alarm";
    if (body == null) body = "Time to take your medication";

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setBackgroundColor(Color.parseColor("#022c22"));
    root.setPadding(48, 48, 48, 48);

    TextView label = new TextView(this);
    label.setText("MEDICATION ALARM");
    label.setTextColor(Color.parseColor("#fbbf24"));
    label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    label.setGravity(Gravity.CENTER);
    root.addView(label);

    TextView t = new TextView(this);
    t.setText(title);
    t.setTextColor(Color.WHITE);
    t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 28);
    t.setGravity(Gravity.CENTER);
    t.setPadding(0, 24, 0, 16);
    root.addView(t);

    TextView b = new TextView(this);
    b.setText(body);
    b.setTextColor(Color.parseColor("#a7f3d0"));
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    b.setGravity(Gravity.CENTER);
    b.setPadding(0, 0, 0, 48);
    root.addView(b);

    Button open = new Button(this);
    open.setText("Open Kynthai — Taken / Skip");
    open.setOnClickListener(v -> {
      // Bring main WebView activity to front
      android.content.Intent i = new android.content.Intent(this, MainActivity.class);
      i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
      i.putExtra("alarm", "1");
      startActivity(i);
      finish();
    });
    root.addView(open);

    setContentView(root);
  }
}
