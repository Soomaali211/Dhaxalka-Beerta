package so.beerta.dhaxalka.gis;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new BeertaAndroidBridge(this, webView), "BeertaAndroidBridge");
        }
    }

    public static class BeertaAndroidBridge {
        private final BridgeActivity activity;
        private final WebView webView;

        public BeertaAndroidBridge(BridgeActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public void printCurrentPage(final String jobTitle, final boolean landscape, final String paperSize) {
            activity.runOnUiThread(() -> {
                try {
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
                } catch (Exception ignored) {
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
                    String cleanName = (fileName != null && !fileName.trim().isEmpty())
                        ? fileName.replaceAll("[^a-zA-Z0-9._-]", "_")
                        : "Beerta_Export.dat";

                    File exportDir = new File(activity.getCacheDir(), "exports");
                    if (!exportDir.exists()) {
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
                } catch (Exception ignored) {
                }
            });
        }
    }
}
