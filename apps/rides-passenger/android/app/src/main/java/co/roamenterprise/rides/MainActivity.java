package co.roamenterprise.rides;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyNavigationBarContrast();
    }

    private void applyNavigationBarContrast() {
        Window window = getWindow();
        if (window == null) {
            return;
        }

        window.setNavigationBarColor(Color.parseColor("#E8EAED"));

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightNavigationBars(true);
        }
    }
}
