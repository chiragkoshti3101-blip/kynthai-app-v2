package app.kynthai.health;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(DoseAlarmPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
