package br.com.prumo.licitacoes;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private static final String ROUTER_HOST = "ateliotic-jann-paragonless.ngrok-free.dev";
    private static final String APP_URL = "https://" + ROUTER_HOST + "/8877/";
    private static final String PREFS = "prumo_connection";
    private static final String PREF_ROUTER_KEY = "router_key";
    private static final int FILE_PICKER_REQUEST = 4172;
    private static final int INK = Color.rgb(38, 59, 54);
    private static final int MUTED = Color.rgb(105, 120, 113);
    private static final int SURFACE = Color.rgb(244, 247, 245);
    private static final int LINE = Color.rgb(222, 230, 225);

    private FrameLayout root;
    private WebView webView;
    private TextView connectionStatus;
    private ValueCallback<Uri[]> fileChooserCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(SURFACE);
        getWindow().setNavigationBarColor(SURFACE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        root = new FrameLayout(this);
        root.setBackgroundColor(SURFACE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 21) {
                view.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);

        String savedKey = preferences().getString(PREF_ROUTER_KEY, "");
        if (savedKey.isEmpty()) showConnectionScreen(null);
        else openApplication(savedKey);
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable rounded(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radiusDp));
        if (strokeColor != Color.TRANSPARENT) drawable.setStroke(dp(1), strokeColor);
        return drawable;
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void showConnectionScreen(String message) {
        if (webView != null) {
            root.removeView(webView);
            webView.onPause();
            webView.destroy();
            webView = null;
        }
        root.removeAllViews();
        root.setBackgroundColor(SURFACE);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout center = new LinearLayout(this);
        center.setGravity(Gravity.CENTER);
        center.setPadding(dp(22), dp(26), dp(22), dp(26));
        scroll.addView(center, new ScrollView.LayoutParams(ScrollView.LayoutParams.MATCH_PARENT, ScrollView.LayoutParams.MATCH_PARENT));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24), dp(26), dp(24), dp(24));
        card.setBackground(rounded(Color.WHITE, 22, LINE));
        card.setElevation(dp(2));
        center.addView(card, new LinearLayout.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels - dp(44), dp(520)), LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout brand = new LinearLayout(this);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        ImageView icon = new ImageView(this);
        icon.setImageResource(R.mipmap.ic_launcher);
        brand.addView(icon, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout brandCopy = new LinearLayout(this);
        brandCopy.setOrientation(LinearLayout.VERTICAL);
        brandCopy.setPadding(dp(12), 0, 0, 0);
        TextView name = text("prumo", 21, INK, true);
        TextView subtitle = text("LICITAÇÕES & OBRAS", 10, MUTED, true);
        brandCopy.addView(name);
        brandCopy.addView(subtitle);
        brand.addView(brandCopy);
        card.addView(brand);

        TextView title = text("Conexão protegida", 23, INK, true);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
        titleParams.topMargin = dp(30);
        card.addView(title, titleParams);
        TextView description = text("Informe a chave do roteador para abrir o Prumo neste aparelho. O endereço e os serviços já estão configurados.", 14, MUTED, false);
        description.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(-1, -2);
        descParams.topMargin = dp(8);
        card.addView(description, descParams);

        TextView label = text("Chave de acesso", 13, INK, true);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(-1, -2);
        labelParams.topMargin = dp(23);
        card.addView(label, labelParams);

        EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setTextSize(15);
        input.setTextColor(INK);
        input.setHintTextColor(Color.rgb(145, 157, 150));
        input.setHint("Cole somente a chave");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setBackground(rounded(SURFACE, 11, LINE));
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(-1, -2);
        inputParams.topMargin = dp(8);
        card.addView(input, inputParams);

        TextView hint = text("A chave é guardada somente no armazenamento privado deste aparelho. Deixe vazio para manter a chave salva.", 12, MUTED, false);
        hint.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams hintParams = new LinearLayout.LayoutParams(-1, -2);
        hintParams.topMargin = dp(8);
        card.addView(hint, hintParams);

        Button connect = new Button(this);
        connect.setText("Conectar ao Prumo");
        connect.setAllCaps(false);
        connect.setTextSize(15);
        connect.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        connect.setTextColor(Color.WHITE);
        connect.setBackground(rounded(INK, 12, Color.TRANSPARENT));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(-1, dp(52));
        buttonParams.topMargin = dp(24);
        card.addView(connect, buttonParams);

        TextView status = text(message == null ? "" : message, 13, Color.rgb(165, 65, 57), false);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-1, -2);
        statusParams.topMargin = dp(12);
        card.addView(status, statusParams);

        Runnable submit = () -> {
            String candidate = input.getText().toString().trim();
            String key = candidate.isEmpty() ? preferences().getString(PREF_ROUTER_KEY, "") : candidate;
            if (!key.matches("[A-Za-z0-9_-]{16,256}")) {
                status.setText("Chave inválida. Cole somente a chave de acesso.");
                input.requestFocus();
                return;
            }
            preferences().edit().putString(PREF_ROUTER_KEY, key).apply();
            openApplication(key);
        };
        connect.setOnClickListener(view -> submit.run());
        input.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                submit.run();
                return true;
            }
            return false;
        });

        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
    }

    private void openApplication(String key) {
        root.removeAllViews();
        root.setBackgroundColor(Color.WHITE);

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        root.addView(page, new FrameLayout.LayoutParams(-1, -1));

        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(8), dp(12), dp(8));
        bar.setBackgroundColor(SURFACE);
        TextView title = text("Prumo", 17, INK, true);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button settings = new Button(this);
        settings.setText("Conexão");
        settings.setAllCaps(false);
        settings.setTextSize(13);
        settings.setTextColor(INK);
        settings.setBackground(rounded(Color.WHITE, 10, LINE));
        bar.addView(settings, new LinearLayout.LayoutParams(-2, dp(40)));
        page.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        settings.setOnClickListener(view -> showConnectionScreen(null));

        connectionStatus = text("Conectando ao servidor seguro…", 12, MUTED, false);
        connectionStatus.setGravity(Gravity.CENTER_VERTICAL);
        connectionStatus.setPadding(dp(16), 0, dp(16), 0);
        page.addView(connectionStatus, new LinearLayout.LayoutParams(-1, dp(28)));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(false);
        webSettings.setAllowContentAccess(true);
        webSettings.setSupportMultipleWindows(false);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (android.os.Build.VERSION.SDK_INT >= 26) webSettings.setSafeBrowsingEnabled(true);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && ROUTER_HOST.equalsIgnoreCase(uri.getHost())) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (connectionStatus != null) connectionStatus.setText("Conectado · dados ficam neste aparelho");
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && connectionStatus != null) {
                    connectionStatus.setText("Servidor indisponível · toque em Conexão para tentar novamente");
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"});
                try {
                    startActivityForResult(Intent.createChooser(intent, "Selecionar documento"), FILE_PICKER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Nenhum seletor de arquivos disponível.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("Download do Prumo");
                request.setDescription("Baixando documento");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);
                String cookie = CookieManager.getInstance().getCookie(url);
                if (cookie != null) request.addRequestHeader("Cookie", cookie);
                manager.enqueue(request);
            } catch (Exception error) {
                Toast.makeText(this, "Não foi possível iniciar o download.", Toast.LENGTH_LONG).show();
            }
        });

        page.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));
        String encoded = Uri.encode(key);
        webView.loadUrl(APP_URL + "?key=" + encoded, java.util.Collections.singletonMap("ngrok-skip-browser-warning", "1"));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Nenhum navegador disponível para abrir o link.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST && fileChooserCallback != null) {
            Uri result = resultCode == RESULT_OK && data != null ? data.getData() : null;
            fileChooserCallback.onReceiveValue(result == null ? null : new Uri[]{result});
            fileChooserCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
