import { app, BrowserWindow, desktop, ipc, Menu, MenuItem, MenuWithRole, prefs, Theme } from '@mobrowser/api';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  GenerateIconRequest,
  GenerateIconResponse,
  GetAvatarRequest,
  GetAvatarResponse,
  GetOpenAIApiKeyStatusRequest,
  GetOpenAIApiKeyStatusResponse,
  GetStoredOpenAIApiKeyRequest,
  GetStoredOpenAIApiKeyResponse,
  GetStylesRequest,
  GetStylesResponse,
  GetHistoryRequest,
  GetHistoryResponse,
  GetHistoryItemRequest,
  GetHistoryItemResponse,
  ClearHistoryRequest,
  ClearHistoryResponse,
  FetchArticleRequest,
  FetchArticleResponse,
  MakeShotListRequest,
  MakeShotListResponse,
  OpenExternalUrlRequest,
  PickReferenceImageRequest,
  PickReferenceImageResponse,
  SaveIconRequest,
  SaveIconResponse,
  SetAvatarRequest,
  SetAvatarResponse,
  SetOpenAIApiKeyRequest,
  SetOpenAIApiKeyResponse,
  SetThemeRequest,
  SetUnsavedIconStateRequest,
  ShowPathInFinderRequest,
  GetTelemetryOptOutRequest,
  GetTelemetryOptOutResponse,
  SetTelemetryOptOutRequest,
  ReportRendererErrorRequest,
  GetImageSettingsRequest,
  GetImageSettingsResponse,
  SetImageSettingsRequest,
  SetAvatarSpecRequest,
} from './gen/app';
import { AppServiceDescriptor } from './gen/ipc_service';
import { buildPrompt } from './lib/prompt-builder';
import { styleList } from './lib/styles';
import { getProvider, resolveProviderName } from './lib/image-provider';
import {
  getResolvedApiKey,
  hasApiKeyInPrefs,
  API_KEY_PREFS_KEY,
} from './lib/openai-api-key';
import {
  getAvatarB64,
  getAvatarMime,
  hasAvatar,
  setAvatar,
  getAvatarSpec,
  setAvatarSpec,
} from './lib/avatar-store';
import {
  getBackendSetting,
  setBackendSetting,
  getOpenRouterModel,
  setOpenRouterModel,
  codexAvailable,
  SUGGESTED_MODELS,
} from './lib/app-settings';
import { makeShotList } from './lib/shot-list';
import { fetchArticle } from './lib/fetch-article';
import {
  saveGeneration,
  listHistory,
  getHistoryItem,
  clearHistory,
} from './lib/history-store';
import {
  initTelemetry,
  isOptedOut,
  setOptedOut,
  capture,
  captureError,
} from './lib/telemetry';

const GITHUB_REPOSITORY_URL = 'https://github.com/caezium/nib';

async function showAboutDialog() {
  const result = await app.showMessageDialog({
    parentWindow: win,
    type: 'info',
    message: `${app.name} ${app.version}`,
    informativeText: `${app.description}\n\nPowered by MōBrowser framework.\n\n${app.copyright}`,
    buttons: [
      { label: 'Close', type: 'primary' },
      { label: 'Open GitHub Repository...', type: 'secondary' },
    ],
  });
  if (result.button.type === 'secondary') {
    desktop.openUrl(GITHUB_REPOSITORY_URL);
  }
}

// Editorial light theme to match the app's paper aesthetic.
app.setTheme('light');

// Anonymous, opt-out telemetry (usage events + crash reports).
initTelemetry(resolveProviderName());

// ---------------------------------------------------------------------------
// Main App Menu
// ---------------------------------------------------------------------------

const macAppMenu = new MenuWithRole({
  role: 'macAppMenu',
  items: [
    new MenuItem({
      id: 'about',
      label: 'About ' + app.name,
      action: (_item: MenuItem) => {
        showAboutDialog();
      }
    }),
    'separator',
    'macHideApp',
    'macHideOthers',
    'macShowAll',
    'separator',
    'quit',
  ]
})

const fileMenu = new MenuWithRole({
  role: 'fileMenu',
  items: [
    'closeWindow',
  ]
})

const editMenu = new MenuWithRole({
  role: 'editMenu',
  items: [
    'undo',
    'redo',
    'separator',
    'cut',
    'copy',
    'paste',
    'pasteAndMatchStyle',
    'delete',
    'selectAll',
  ]
})

const viewMenu = new Menu({
  label: 'View',
  items: [
    'zoomReset',
    'zoomIn',
    'zoomOut',
    'separator',
    'fullScreen',
  ]
})

const windowMenu = new MenuWithRole({
  role: 'windowMenu',
  items: [
    'minimizeWindow',
  ]
})

const helpMenu = new MenuWithRole({
  role: 'helpMenu',
  items: [
    new MenuItem({
      id: 'openGitHub',
      label: 'Open GitHub Repository...',
      action: (_item: MenuItem) => {
        desktop.openUrl(GITHUB_REPOSITORY_URL);
      }
    }),
  ]
})

const appMenu = new Menu({
  items: [
    macAppMenu,
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ]
})
app.setMenu(appMenu)

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

let hasUnsavedIllustration = false;

// Create the main app window. Wider/taller than the icon app to fit 16:9 art.
const win = new BrowserWindow({
  url: app.url,
  size: { width: 720, height: 640 },
  resizable: true,
  windowTitleVisible: false,
  windowTitlebarVisible: false,
  windowButtonPosition: { x: 20, y: 20 },
  windowButtonVisible: {
    maximize: false,
    zoom: false,
  }
});
win.centerWindow();
win.show();

win.handle('close', async () => {
  if (!hasUnsavedIllustration) {
    return 'close';
  }
  const result = await app.showMessageDialog({
    parentWindow: win,
    type: 'warning',
    title: 'Quit without saving?',
    message:
      'Your illustration has not been saved. If you quit now, it will be lost.',
    buttons: [
      { label: 'Cancel', type: 'secondary' },
      { label: 'Quit Anyway', type: 'primary' },
    ],
  });
  if (result.button.type === 'primary') {
    return 'close';
  }
  return 'cancel';
});

// ---------------------------------------------------------------------------
// IPC service
// ---------------------------------------------------------------------------

ipc.registerService(AppServiceDescriptor, {
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },

  async SetUnsavedIconState(request: SetUnsavedIconStateRequest) {
    hasUnsavedIllustration = request.unsaved;
    return {};
  },

  async SaveIcon(request: SaveIconRequest): Promise<SaveIconResponse> {
    const pick = await app.showSaveDialog({
      parentWindow: win,
      title: 'Save illustration',
      buttonLabelSave: 'Save',
      defaultPath: path.join(app.getPath('userHome'), 'Desktop', 'illustration.png'),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      features: { canCreateDirectories: true },
    });

    if (pick.canceled || !pick.path) {
      return { savedPath: '', canceled: true, imagePath: '', error: '' };
    }

    // Guarantee a .png extension.
    let target = path.resolve(pick.path);
    if (path.extname(target).toLowerCase() !== '.png') {
      target = `${target}.png`;
    }

    try {
      await fs.writeFile(target, Buffer.from(request.imageData));
      // The renderer clears its unsaved flag on a successful save (which syncs
      // back via SetUnsavedIconState); the main process no longer flips the flag
      // itself, so an Article-mode save can't silently clear a Concept-mode
      // unsaved state.
      capture('save', { status: 'ok' });
      return { savedPath: path.dirname(target), canceled: false, imagePath: target, error: '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      capture('save', { status: 'error' });
      captureError(err, { scope: 'save' });
      return { savedPath: '', canceled: false, imagePath: '', error: `Could not save the file: ${message}` };
    }
  },

  async ShowPathInFinder(request: ShowPathInFinderRequest) {
    if (request.path) {
      desktop.showPath(request.path);
    }
    return {};
  },

  async OpenExternalUrl(request: OpenExternalUrlRequest) {
    const url = request.url.trim();
    if (url) {
      desktop.openUrl(url);
    }
    return {};
  },

  async PickReferenceImage(
    _request: PickReferenceImageRequest
  ): Promise<PickReferenceImageResponse> {
    // Use the native open dialog rather than an HTML <input type=file>: in
    // MoBrowser the native picker is the reliable way to choose a file from the
    // sandboxed renderer.
    const pick = await app.showOpenDialog({
      parentWindow: win,
      title: 'Choose image',
      buttonLabelOpen: 'Choose',
      selectionPolicy: 'files',
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      ],
    });

    if (pick.canceled || pick.paths.length === 0) {
      return { imageB64: '', mime: '', canceled: true, error: '' };
    }

    try {
      const picked = pick.paths[0];
      const bytes = await fs.readFile(picked);
      const ext = path.extname(picked).toLowerCase();
      const mime =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/png';
      return {
        imageB64: bytes.toString('base64'),
        mime,
        canceled: false,
        error: '',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { imageB64: '', mime: '', canceled: false, error: message };
    }
  },

  async SetAvatar(request: SetAvatarRequest): Promise<SetAvatarResponse> {
    const b64 = request.imageB64.trim();
    if (!b64) {
      return { error: 'No image data.' };
    }
    if (!setAvatar(b64, request.mime)) {
      return { error: 'Could not save the avatar to disk.' };
    }
    return { error: '' };
  },

  async GetAvatar(_request: GetAvatarRequest): Promise<GetAvatarResponse> {
    return {
      imageB64: getAvatarB64(),
      mime: getAvatarMime(),
      hasAvatar: hasAvatar(),
      spec: getAvatarSpec(),
    };
  },

  async GenerateIcon(request: GenerateIconRequest): Promise<GenerateIconResponse> {
    const startedAt = Date.now();
    const provider = resolveProviderName();
    try {
      const { positive, negative } = buildPrompt(request.prompt, request.style, getAvatarSpec());
      // The avatar is the persistent reference character; a per-generation
      // reference image (if the user attached one) takes precedence. The avatar
      // carries its own MIME so a non-PNG avatar isn't mislabeled to the provider
      // (which would make OpenAI's /images/edits reject it).
      const perGenReference = request.referenceImage.trim();
      const reference = perGenReference || getAvatarB64() || undefined;
      // Honor the attachment's real MIME; fall back to the avatar's MIME when no
      // per-generation reference was supplied.
      const referenceMime = perGenReference
        ? request.referenceMime.trim() || 'image/png'
        : getAvatarMime();
      const count = request.variantCount > 0 ? request.variantCount : 3;
      const result = await getProvider().generate({
        positivePrompt: positive,
        negativePrompt: negative,
        referenceImageB64: reference,
        referenceImageMime: referenceMime,
        count,
      });
      // Save real generations to history (skip mock placeholders). Awaited so
      // the serialized index write finishes (and orders) before we return.
      if (result.images.length > 0 && provider !== 'mock') {
        await saveGeneration(request.prompt, request.style, result.images).catch(() => {});
      }
      capture('generation', {
        status: 'ok',
        style: request.style,
        provider,
        variants: result.images.length,
        requested: count,
        duration_ms: Date.now() - startedAt,
      });
      return { images: result.images, error: '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      capture('generation', {
        status: 'error',
        style: request.style,
        provider,
        duration_ms: Date.now() - startedAt,
      });
      captureError(err, { scope: 'generate' });
      return { images: [], error: message };
    }
  },

  async GetStyles(_request: GetStylesRequest): Promise<GetStylesResponse> {
    return { styles: styleList() };
  },

  async GetHistory(_request: GetHistoryRequest): Promise<GetHistoryResponse> {
    const items = await listHistory();
    return {
      items: items.map((it) => ({
        id: it.id,
        createdAt: it.createdAt,
        prompt: it.prompt,
        style: it.style,
        thumbB64: it.thumbB64,
        count: it.count,
      })),
    };
  },

  async GetHistoryItem(
    request: GetHistoryItemRequest
  ): Promise<GetHistoryItemResponse> {
    return { images: await getHistoryItem(request.id) };
  },

  async ClearHistory(_request: ClearHistoryRequest): Promise<ClearHistoryResponse> {
    await clearHistory();
    return {};
  },

  async FetchArticle(request: FetchArticleRequest): Promise<FetchArticleResponse> {
    if (!request.url.trim()) {
      return { markdown: '', title: '', error: 'Enter a URL.' };
    }
    try {
      const { markdown, title } = await fetchArticle(request.url);
      capture('article_fetch', { status: 'ok' });
      return { markdown, title, error: '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      capture('article_fetch', { status: 'error' });
      captureError(err, { scope: 'article_fetch' });
      return { markdown: '', title: '', error: message };
    }
  },

  async MakeShotList(request: MakeShotListRequest): Promise<MakeShotListResponse> {
    try {
      const shots = await makeShotList(request.article);
      capture('shotlist', { status: 'ok', shots: shots.length });
      return {
        shots: shots.map((s) => ({
          theme: s.theme,
          coreIdea: s.coreIdea,
          labels: s.labels,
        })),
        error: '',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      capture('shotlist', { status: 'error' });
      captureError(err, { scope: 'shotlist' });
      return { shots: [], error: message };
    }
  },

  async GetOpenAIApiKeyStatus(
    _request: GetOpenAIApiKeyStatusRequest
  ): Promise<GetOpenAIApiKeyStatusResponse> {
    // A key is required for any real image provider (OpenAI or OpenRouter);
    // only the mock provider needs none.
    const name = resolveProviderName();
    return {
      // The Codex (free sub) and mock lanes need no API key.
      openaiKeyRequired: name !== 'mock' && name !== 'codex',
      hasOpenaiKey: hasApiKeyInPrefs(),
      isMock: name === 'mock',
    };
  },

  async GetStoredOpenAIApiKey(
    _request: GetStoredOpenAIApiKeyRequest
  ): Promise<GetStoredOpenAIApiKeyResponse> {
    return { apiKey: getResolvedApiKey() };
  },

  async SetOpenAIApiKey(
    request: SetOpenAIApiKeyRequest
  ): Promise<SetOpenAIApiKeyResponse> {
    const key = request.apiKey.trim();
    if (!key) {
      return { error: 'API key cannot be empty.' };
    }
    prefs.setString(API_KEY_PREFS_KEY, key);
    if (!prefs.persist()) {
      return { error: 'Could not save preferences to disk.' };
    }
    return { error: '' };
  },

  async GetTelemetryOptOut(
    _request: GetTelemetryOptOutRequest
  ): Promise<GetTelemetryOptOutResponse> {
    return { optOut: isOptedOut() };
  },

  async SetTelemetryOptOut(request: SetTelemetryOptOutRequest) {
    setOptedOut(request.optOut);
    return {};
  },

  async ReportRendererError(request: ReportRendererErrorRequest) {
    // The renderer forwards UI crashes here so they reach the same sink. The
    // payload is content-free (message + stack + a source tag).
    const err = new Error(request.message || 'Renderer error');
    if (request.stack) err.stack = request.stack;
    captureError(err, { scope: 'renderer', source: request.source });
    return {};
  },

  async GetImageSettings(
    _request: GetImageSettingsRequest
  ): Promise<GetImageSettingsResponse> {
    return {
      backend: getBackendSetting(),
      model: getOpenRouterModel(),
      codexAvailable: codexAvailable(),
      hasKey: hasApiKeyInPrefs(),
      suggestedModels: SUGGESTED_MODELS,
    };
  },

  async SetImageSettings(request: SetImageSettingsRequest) {
    if (request.backend) setBackendSetting(request.backend);
    if (request.model) setOpenRouterModel(request.model);
    return {};
  },

  async SetAvatarSpec(request: SetAvatarSpecRequest) {
    setAvatarSpec(request.spec);
    return {};
  },
});
