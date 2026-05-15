package com.sheenai.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Custom WebView chrome client so that getUserMedia() from the React
 * audio-capture code triggers the Android OS-level RECORD_AUDIO prompt.
 *
 * Capacitor 8's default BridgeWebChromeClient already handles this on
 * most stock builds, but some OEM ROMs (Xiaomi, Samsung One UI, certain
 * Huawei distributions) silently drop the WebView permission callback
 * and the user gets a NotAllowedError without ever seeing the system
 * permission dialog. Explicitly overriding onPermissionRequest here
 * makes the flow deterministic.
 *
 * Flow:
 *   1. JS calls navigator.mediaDevices.getUserMedia({ audio: true }).
 *   2. WebView fires onPermissionRequest with RESOURCE_AUDIO_CAPTURE.
 *   3. If OS RECORD_AUDIO is already granted → grant the WebView.
 *   4. Otherwise → request the OS permission via ActivityCompat. The
 *      user sees the system dialog; result lands in
 *      onRequestPermissionsResult, which then grants or denies the
 *      pending WebView request.
 */
public class MainActivity extends BridgeActivity {
    private static final int MIC_PERMISSION_REQ = 1001;
    private PermissionRequest pendingMicRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        for (String resource : request.getResources()) {
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                                if (ContextCompat.checkSelfPermission(
                                        MainActivity.this,
                                        Manifest.permission.RECORD_AUDIO) ==
                                        PackageManager.PERMISSION_GRANTED) {
                                    request.grant(new String[]{
                                        PermissionRequest.RESOURCE_AUDIO_CAPTURE
                                    });
                                } else {
                                    pendingMicRequest = request;
                                    ActivityCompat.requestPermissions(
                                        MainActivity.this,
                                        new String[]{Manifest.permission.RECORD_AUDIO},
                                        MIC_PERMISSION_REQ);
                                }
                                return;
                            }
                        }
                        request.deny();
                    });
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MIC_PERMISSION_REQ && pendingMicRequest != null) {
            if (grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingMicRequest.grant(new String[]{
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE
                });
            } else {
                pendingMicRequest.deny();
            }
            pendingMicRequest = null;
        }
    }
}
