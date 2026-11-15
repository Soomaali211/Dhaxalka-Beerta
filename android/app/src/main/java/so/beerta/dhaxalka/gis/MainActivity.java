package so.beerta.dhaxalka.gis;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 4102;
    private static final long EXPORT_CACHE_TTL_MS = 24L * 60L * 60L * 1000L;

    private BeertaAndroidBridge androidBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pruneStaleExports();

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
            }
            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setMediaPlaybackRequiresUserGesture(false);

            String ua = settings.getUserAgentString();
            String cleanedUa = ua != null ? ua.replace("; wv", "") : "Android";
            if (!cleanedUa.contains("BeertaAPK/")) {
                cleanedUa = cleanedUa + " BeertaAPK/1.6.1";
            }
            settings.setUserAgentString(cleanedUa);

            androidBridge = new BeertaAndroidBridge(this, webView);
            webView.addJavascriptInterface(androidBridge, "BeertaAndroidBridge");
        }
    }

    @Override
    public void onDestroy() {
        if (androidBridge != null) {
            androidBridge.stopNativePrecisionGps();
        }
        super.onDestroy();
    }

    private void pruneStaleExports() {
        try {
            File exportDir = new File(getCacheDir(), "exports");
            if (!exportDir.exists() || !exportDir.isDirectory()) return;
            File[] files = exportDir.listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - EXPORT_CACHE_TTL_MS;
            for (File f : files) {
                if (f != null && f.isFile() && f.lastModified() < cutoff) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        } catch (Throwable ignored) {
        }
    }

    public static class BeertaAndroidBridge {
        private final BridgeActivity activity;
        private final WebView webView;
        private LocationManager locationManager;
        private LocationListener precisionListener;

        public BeertaAndroidBridge(BridgeActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public boolean requestLocationPermission() {
            try {
                int fine = ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                );
                int coarse = ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                );
                if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
                    return true;
                }
                ActivityCompat.requestPermissions(
                    activity,
                    new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    LOCATION_PERMISSION_REQUEST_CODE
                );
                return false;
            } catch (Throwable ignored) {
                return false;
            }
        }

        @SuppressLint("MissingPermission")
        @JavascriptInterface
        public boolean startNativePrecisionGps() {
            final boolean granted = requestLocationPermission();
            if (!granted) {
                return false;
            }
            activity.runOnUiThread(() -> {
                try {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    if (ContextCompat.checkSelfPermission(
                            activity,
                            Manifest.permission.ACCESS_FINE_LOCATION
                        ) != PackageManager.PERMISSION_GRANTED &&
                        ContextCompat.checkSelfPermission(
                            activity,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        return;
                    }

                    if (locationManager == null) {
                        locationManager = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
                    }
                    if (locationManager == null) return;

                    stopListenersOnly();

                    precisionListener = new LocationListener() {
                        @Override
                        public void onLocationChanged(Location loc) {
                            dispatchLocationToWebView(loc);
                        }

                        @Override
                        public void onProviderEnabled(String provider) {}

                        @Override
                        public void onProviderDisabled(String provider) {}

                        @Override
                        public void onStatusChanged(String provider, int status, Bundle extras) {}
                    };

                    // Seed immediately with fresh last-known GPS fix if available (< 45s old)
                    Location lastGps = null;
                    try {
                        if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                            lastGps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                        }
                    } catch (Throwable ignored) {}
                    if (lastGps != null && (System.currentTimeMillis() - lastGps.getTime()) < 45000L) {
                        dispatchLocationToWebView(lastGps);
                    }

                    // Stream continuous raw GNSS hardware fixes (1000ms, 1m threshold)
                    if (locationManager.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
                        locationManager.requestLocationUpdates(
                            LocationManager.GPS_PROVIDER,
                            1000L,
                            0.5f,
                            precisionListener,
                            Looper.getMainLooper()
                        );
                    }

                    // Register Android 12+ OS Fused Location Provider when supported
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        try {
                            if (locationManager.getAllProviders().contains(LocationManager.FUSED_PROVIDER)) {
                                locationManager.requestLocationUpdates(
                                    LocationManager.FUSED_PROVIDER,
                                    1000L,
                                    0.5f,
                                    precisionListener,
                                    Looper.getMainLooper()
                                );
                            }
                        } catch (Throwable ignored) {}
                    }
                } catch (Throwable ignored) {
                }
            });
            return true;
        }

        @JavascriptInterface
        public void stopNativePrecisionGps() {
            activity.runOnUiThread(this::stopListenersOnly);
        }

        private void stopListenersOnly() {
            try {
                if (locationManager != null && precisionListener != null) {
                    locationManager.removeUpdates(precisionListener);
                }
            } catch (Throwable ignored) {
            }
            precisionListener = null;
        }

        private void dispatchLocationToWebView(Location loc) {
            if (loc == null || webView == null) return;
            try {
                double lat = loc.getLatitude();
                double lng = loc.getLongitude();
                float acc = loc.hasAccuracy() ? loc.getAccuracy() : 15f;
                String altStr = loc.hasAltitude() ? String.format(Locale.US, "%.2f", loc.getAltitude()) : "null";
                String spdStr = loc.hasSpeed() ? String.format(Locale.US, "%.2f", loc.getSpeed()) : "null";
                String brgStr = loc.hasBearing() ? String.format(Locale.US, "%.1f", loc.getBearing()) : "null";
                long ts = loc.getTime() > 0 ? loc.getTime() : System.currentTimeMillis();
                String prov = "gps".equalsIgnoreCase(loc.getProvider()) ? "native_gnss" : "network_fallback";

                final String js = String.format(
                    Locale.US,
                    "window.__onBeertaNativeGpsLocation && window.__onBeertaNativeGpsLocation({lat:%.8f,lng:%.8f,accuracyM:%.2f,altitudeM:%s,speedMps:%s,headingDeg:%s,timestampMs:%d,provider:'%s'});",
                    lat, lng, acc, altStr, spdStr, brgStr, ts, prov
                );
                webView.post(() -> {
                    try {
                        if (!activity.isFinishing() && !activity.isDestroyed()) {
                            webView.evaluateJavascript(js, null);
                        }
                    } catch (Throwable ignored) {}
                });
            } catch (Throwable ignored) {
            }
        }

        @JavascriptInterface
        public void printCurrentPage(final String jobTitle, final boolean landscape, final String paperSize) {
            activity.runOnUiThread(() -> {
                try {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                    if (printManager == null) return;

                    String safeTitle = (jobTitle != null && !jobTitle.trim().isEmpty())
                        ? jobTitle.trim()
                        : "Beerta_iyo_Dhaxalka_PDF";

                    PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(safeTitle);
                    PrintAttributes.MediaSize baseSize = "A3".equalsIgnoreCase(paperSize)
                        ? PrintAttributes.MediaSize.ISO_A3
                        : PrintAttributes.MediaSize.ISO_A4;
                    PrintAttributes.MediaSize orientedSize = landscape
                        ? baseSize.asLandscape()
                        : baseSize.asPortrait();

                    PrintAttributes attrs = new PrintAttributes.Builder()
                        .setMediaSize(orientedSize)
                        .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                        .build();

                    printManager.print(safeTitle, adapter, attrs);
                } catch (Throwable ignored) {
                }
            });
        }

        @JavascriptInterface
        public void saveAndShareBase64File(
            final String fileName,
            final String mimeType,
            final String base64Payload
        ) {
            activity.runOnUiThread(() -> {
                try {
                    if (activity.isFinishing() || activity.isDestroyed()) return;
                    if (base64Payload == null || base64Payload.isEmpty()) return;

                    String cleanName = (fileName != null && !fileName.trim().isEmpty())
                        ? fileName.replaceAll("[^a-zA-Z0-9._-]", "_")
                        : "Beerta_Export.dat";

                    File exportDir = new File(activity.getCacheDir(), "exports");
                    if (!exportDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        exportDir.mkdirs();
                    }
                    File outFile = new File(exportDir, cleanName);

                    byte[] bytes = Base64.decode(base64Payload, Base64.DEFAULT);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                        fos.flush();
                    }

                    Uri contentUri = FileProvider.getUriForFile(
                        activity,
                        activity.getPackageName() + ".fileprovider",
                        outFile
                    );

                    String resolvedMime = (mimeType != null && !mimeType.trim().isEmpty())
                        ? mimeType
                        : "application/octet-stream";

                    Intent shareIntent = new Intent(Intent.ACTION_SEND);
                    shareIntent.setType(resolvedMime);
                    shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
                    shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                    Intent chooser = Intent.createChooser(shareIntent, cleanName);
                    activity.startActivity(chooser);
                } catch (Throwable ignored) {
                }
            });
        }
    }
}
