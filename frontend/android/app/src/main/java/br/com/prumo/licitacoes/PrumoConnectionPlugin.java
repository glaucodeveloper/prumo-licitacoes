package br.com.prumo.licitacoes;

import android.net.Uri;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;

@CapacitorPlugin(name = "PrumoConnection")
public final class PrumoConnectionPlugin extends Plugin {
    private static final String TRUSTED_HOST = "ateliotic-jann-paragonless.ngrok-free.dev";

    @PluginMethod
    public void open(PluginCall call) {
        String rawUrl = call.getString("url", "");
        Uri uri = Uri.parse(rawUrl);
        if (!"https".equals(uri.getScheme())
                || !TRUSTED_HOST.equalsIgnoreCase(uri.getHost())
                || !"/8877/".equals(uri.getPath())
                || uri.getQueryParameter("key") == null) {
            call.reject("Endereço de conexão inválido.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            if (webView == null) {
                call.reject("O aplicativo ainda está iniciando.");
                return;
            }
            HashMap<String, String> headers = new HashMap<>();
            headers.put("ngrok-skip-browser-warning", "1");
            call.resolve(new com.getcapacitor.JSObject().put("opened", true));
            webView.postDelayed(() -> webView.loadUrl(uri.toString(), headers), 120);
        });
    }
}
