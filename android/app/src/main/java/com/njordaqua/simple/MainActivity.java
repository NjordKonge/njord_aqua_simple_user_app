package com.njordaqua.simple;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Some Android builds hard-freeze (ANR) when the native Autofill
        // framework scans a WebView that contains editable <input> fields.
        // Disabling autofill on the WebView prevents that freeze. This fixes
        // text inputs across the whole app, not just one screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView webView = this.bridge.getWebView();
            if (webView != null) {
                webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            }
        }
    }
}
