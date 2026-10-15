// ============================================================================
// Frontend HTML Template
// Responsive web UI for image generation
// ============================================================================

export function getFrontendHTML(): string {
  return `<!DOCTYPE html>
<html lang="en" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare AI Image Generator</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" crossorigin="anonymous">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
    <style>
        :root {
            --primary: #5046e5;
            --primary-light: #6e67eb;
            --primary-dark: #4338ca;
            --secondary: #f0f4f8;
            --text: #1a202c;
            --text-light: #4a5568;
            --background: #ffffff;
            --card-bg: #f7fafc;
            --border: #e2e8f0;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
            --info: #3b82f6;
        }

        .dark {
            --primary: #6e67eb;
            --primary-light: #8a84ee;
            --primary-dark: #5046e5;
            --secondary: #2d3748;
            --text: #f7fafc;
            --text-light: #cbd5e0;
            --background: #111827;
            --card-bg: #1f2937;
            --border: #374151;
            --success: #10b981;
            --error: #ef4444;
            --warning: #f59e0b;
            --info: #3b82f6;
        }

        body {
            background-color: var(--background);
            color: var(--text);
            transition: background-color 0.3s ease, color 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .btn {
            padding: 1rem 1.5rem;
            border-radius: 0.375rem;
            transition: all 0.3s;
        }

        .btn:focus { outline: none; }

        .btn:focus-visible {
            outline: 2px solid var(--primary);
            outline-offset: 2px;
        }

        .text-primary { color: var(--primary); }

        @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .fade-in { animation: fade-in 0.3s ease; }

        .btn-primary {
            background-color: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background-color: var(--primary-light);
            transform: translateY(-1px);
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .btn-secondary {
            background-color: var(--secondary);
            color: var(--text);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background-color: var(--border);
            transform: translateY(-1px);
        }

        .card {
            background-color: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transition: all 0.3s ease;
        }

        .card:hover {
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }

        input, select, textarea {
            background-color: var(--background);
            color: var(--text);
            border: 1px solid var(--border);
            border-radius: 0.375rem;
            padding: 0.5rem 0.75rem;
            transition: all 0.3s ease;
            width: 100%;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.1);
        }

        .slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 6px;
            border-radius: 5px;
            background: var(--border);
            outline: none;
            margin: 10px 0;
        }

        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .slider::-webkit-slider-thumb:hover {
            transform: scale(1.2);
            box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.2);
        }

        .loading-mask {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(0,0,0,0.6);
            border-radius: 0.5rem;
            z-index: 10;
            backdrop-filter: blur(4px);
        }

        .image-container {
            aspect-ratio: 1 / 1;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: var(--card-bg);
            position: relative;
            border-radius: 0.5rem;
            max-height: 400px;
            margin: 0 auto;
            width: 100%;
        }

        .hidden { display: none !important; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
        }

        .animate-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        @media (max-width: 768px) {
            .mobile-flex-col { flex-direction: column; }
            .container { padding-left: 1rem; padding-right: 1rem; }
        }

        @media (min-width: 1024px) {
            .container { max-width: 1200px; }
        }
    </style>
</head>
<body class="min-h-screen py-4">
    <!-- Login Modal -->
    <div id="loginModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="card p-8 max-w-md w-full mx-4">
            <h2 class="text-2xl font-bold mb-4 flex items-center">
                <i class="fa-solid fa-lock mr-2 text-primary"></i>Login Required
            </h2>
            <p class="text-sm mb-4 opacity-75">Enter your API key to access the image generator.</p>
            <div class="space-y-4">
                <div>
                    <label for="password" class="block text-sm font-medium mb-1">Password / API Key</label>
                    <input type="password" id="password" class="w-full" placeholder="Enter your API key">
                </div>
                <div id="loginError" class="text-sm text-red-500 hidden" role="alert"></div>
                <button id="loginButton" class="btn btn-primary w-full py-3">
                    <i class="fa-solid fa-sign-in-alt mr-2"></i>Login
                </button>
            </div>
        </div>
    </div>

    <!-- Admin Modal -->
    <div id="adminModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden" role="dialog" aria-modal="true" aria-labelledby="adminModalTitle">
        <div class="card p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <div class="flex justify-between items-center border-b border-gray-700 pb-3">
                <h2 id="adminModalTitle" class="text-xl font-semibold flex items-center">
                    <i class="fa-solid fa-key mr-2 text-primary"></i>Provider Credentials
                </h2>
                <div class="flex items-center gap-2">
                    <span id="adminHealthState" class="text-xs opacity-75" role="status"></span>
                    <button id="adminModalClose" class="btn btn-secondary p-1 h-8 w-8 flex items-center justify-center rounded" aria-label="Close admin dialog">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>
            <p class="text-sm opacity-75">Keys are sealed server-side on save. Unlock with the management key to view and manage them.</p>
            <div>
                <label for="adminKey" class="block text-sm font-medium mb-1">Management key</label>
                <div class="flex gap-2">
                    <input type="password" id="adminKey" class="w-full" placeholder="Admin key (never stored)" autocomplete="off">
                    <button id="adminUnlock" class="btn btn-secondary text-sm py-1 px-3">Unlock</button>
                    <button id="adminLock" class="btn btn-secondary text-sm py-1 px-3 hidden">Lock</button>
                </div>
                <p id="adminError" class="text-sm text-red-500 hidden" role="alert"></p>
            </div>
            <div id="adminPanel" class="space-y-3 hidden">
                <div id="adminKeys" class="space-y-2"></div>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <input id="newKeyLabel" class="w-full" placeholder="Label (e.g. billing)" aria-label="New key label">
                    <input type="password" id="newKeyToken" class="w-full" placeholder="API token" aria-label="New API token" autocomplete="off">
                    <select id="newKeyProvider" class="w-full" aria-label="Provider"></select>
                    <button id="addKeyButton" class="btn btn-primary text-sm py-1 px-3">Add key</button>
                </div>
                <p id="adminNotice" class="text-sm hidden" role="status"></p>
            </div>
        </div>
    </div>

    <div class="container mx-auto px-4 py-4 max-w-6xl">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl md:text-3xl font-bold flex items-center">
                <i class="fa-solid fa-image mr-2"></i>AI Image Generator
            </h1>
            <div class="flex items-center space-x-2">
                <button id="adminModalButton" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Manage Provider Credentials">
                    <i class="fa-solid fa-key mr-2 text-primary"></i>Admin
                </button>
                <button id="logoutButton" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Logout">
                    <i class="fa-solid fa-sign-out-alt mr-2"></i>Logout
                </button>
                <button id="themeToggle" class="btn btn-secondary p-2 h-10 w-10 flex items-center justify-center" aria-label="Toggle dark theme">
                    <i class="fa-solid fa-moon"></i>
                </button>
            </div>
        </div>

        <div class="flex flex-col lg:flex-row gap-6 mobile-flex-col">
            <!-- Left Control Panel -->
            <div class="w-full lg:w-2/5 space-y-4">
                <!-- Basic Settings -->
                <div class="card p-4 space-y-4 fade-in">
                    <h2 class="text-lg font-semibold flex items-center">
                        <i class="fa-solid fa-sliders mr-2 text-primary"></i>Settings
                    </h2>

                    <div>
                        <label for="model" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-robot mr-1"></i>Model
                        </label>
                        <select id="model" class="w-full">
                            <option value="">Loading models…</option>
                        </select>
                        <p id="modelError" class="text-sm text-red-500 hidden" role="alert"></p>
                    </div>

                    <div>
                        <label for="prompt" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Prompt
                        </label>
                        <textarea id="prompt" rows="3" placeholder="Describe your image... Use --param=value for additional settings" class="w-full">cyberpunk cat</textarea>
                    </div>

                    <div id="negativePromptWrap">
                        <label for="negative_prompt" class="block text-sm font-medium mb-1">
                            <i class="fa-solid fa-ban mr-1"></i>Negative Prompt
                        </label>
                        <textarea id="negative_prompt" rows="2" placeholder="Elements to avoid..." class="w-full"></textarea>
                    </div>
                </div>

                <!-- Advanced Options -->
                <div class="card p-4 space-y-4 fade-in">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-semibold flex items-center">
                            <i class="fa-solid fa-gear mr-2 text-primary"></i>Advanced Options
                        </h2>
                        <button id="toggleAdvanced" class="text-xs btn btn-secondary py-1 px-3" aria-expanded="false" aria-controls="advancedOptions">
                            <i class="fa-solid fa-chevron-down mr-1" id="advancedIcon"></i>Show/Hide
                        </button>
                    </div>

                    <div id="advancedOptions" class="space-y-3 hidden">
                        <div id="sizeWrap">
                            <label for="size" class="block text-sm font-medium mb-1">
                                <i class="fa-solid fa-expand mr-1"></i>Size
                            </label>
                            <select id="size" class="w-full">
                                <option value="">Loading sizes…</option>
                            </select>
                        </div>

                        <div id="stepsWrap">
                            <div class="flex justify-between items-center">
                                <label for="steps" class="block text-sm font-medium">Steps</label>
                                <span id="stepsValue" class="text-sm font-mono">4</span>
                            </div>
                            <input type="range" id="steps" min="1" max="20" step="1" value="4" class="slider w-full">
                        </div>

                        <div id="guidanceWrap">
                            <div class="flex justify-between items-center">
                                <label for="guidance" class="block text-sm font-medium">Guidance</label>
                                <span id="guidanceValue" class="text-sm font-mono">7.5</span>
                            </div>
                            <input type="range" id="guidance" min="1" max="30" step="0.5" value="7.5" class="slider w-full">
                        </div>

                        <div>
                            <label for="seed" class="block text-sm font-medium mb-1">Seed (leave empty for random)</label>
                            <div class="flex gap-2">
                                <input type="number" id="seed" placeholder="Random seed" class="w-full">
                                <button id="randomSeed" class="btn btn-secondary text-sm py-1 px-3" aria-label="Randomize seed">
                                    <i class="fa-solid fa-random"></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label for="n" class="block text-sm font-medium mb-1">Number of images</label>
                            <select id="n" class="w-full">
                                <option value="1" selected>1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                <option value="6">6</option>
                                <option value="7">7</option>
                                <option value="8">8</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button id="submitButton" class="btn btn-primary w-full py-3 flex items-center justify-center">
                    <i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Image
                </button>
            </div>

            <!-- Result column -->
            <div class="w-full lg:w-3/5 space-y-6">
                <!-- Panel: Result -->
                <div class="card p-4 space-y-4 fade-in">
                    <div class="flex justify-between items-center">
                        <h2 class="text-lg font-semibold flex items-center">
                            <i class="fa-solid fa-image mr-2 text-primary"></i>Result
                        </h2>
                        <div class="flex space-x-2">
                            <button id="downloadButton" class="btn btn-secondary text-sm py-1 px-3 hidden">
                                <i class="fa-solid fa-download mr-1"></i>Download
                            </button>
                        </div>
                    </div>

                    <div class="image-container card">
                        <div id="loadingOverlay" class="loading-mask hidden" role="status" aria-label="Generating image">
                            <div class="text-center">
                                <div class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
                                <p class="text-white mt-3 font-medium">Generating...</p>
                            </div>
                        </div>
                        <div id="initialPrompt" class="text-center text-gray-400 dark:text-gray-600">
                            <i class="fa-solid fa-image-portrait text-4xl mb-2"></i>
                            <p>Click generate to create an image</p>
                        </div>
                        <img id="aiImage" class="max-h-full max-w-full rounded hidden" alt="Generated image">
                    </div>

                    <div id="generateError" class="text-sm text-red-500 hidden" role="alert"></div>

                    <div id="imageInfo" class="space-y-3 mt-2">
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div><span class="font-medium">Model:</span> <span id="usedModel">-</span></div>
                            <div><span class="font-medium">Time:</span> <span id="generationTime">-</span></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Configuration
        const API_BASE = '/v1';

        // State
        let currentImageUrl = null;
        let authToken = sessionStorage.getItem('api_key') || '';

        // Auth Elements
        const loginModal = document.getElementById('loginModal');
        const passwordInput = document.getElementById('password');
        const loginButton = document.getElementById('loginButton');
        const loginError = document.getElementById('loginError');
        const logoutButton = document.getElementById('logoutButton');
        const adminModalButton = document.getElementById('adminModalButton');
        const adminModal = document.getElementById('adminModal');
        const adminModalClose = document.getElementById('adminModalClose');

        // Check auth status on load
        function checkAuth() {
            if (authToken) {
                loginModal.classList.add('hidden');
                logoutButton.classList.remove('hidden');
                adminModalButton.classList.remove('hidden');
            } else {
                loginModal.classList.remove('hidden');
                logoutButton.classList.add('hidden');
                adminModalButton.classList.add('hidden');
            }
        }

        // Login handler
        loginButton.addEventListener('click', async () => {
            const password = passwordInput.value.trim();
            if (!password) {
                loginError.textContent = 'Please enter a password';
                loginError.classList.remove('hidden');
                return;
            }

            loginButton.disabled = true;
            loginButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Logging in...';

            try {
                // Validate against an authenticated route: /health is
                // public by design, so any key would pass (#49).
                // /v1/models 401s on a bad key, 200s when the key is
                // valid (or when no API_KEYS are configured).
                const response = await fetch(API_BASE + '/models', {
                    headers: { 'Authorization': 'Bearer ' + password }
                });

                if (response.ok) {
                    authToken = password;
                    sessionStorage.setItem('api_key', authToken);
                    loginError.classList.add('hidden');
                    passwordInput.value = '';
                    checkAuth();
                } else {
                    loginError.textContent = 'Invalid API key';
                    loginError.classList.remove('hidden');
                }
            } catch (error) {
                loginError.textContent = 'Login failed: ' + error.message;
                loginError.classList.remove('hidden');
            } finally {
                loginButton.disabled = false;
                loginButton.innerHTML = '<i class="fa-solid fa-sign-in-alt mr-2"></i>Login';
            }
        });

        // Allow Enter key to submit
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loginButton.click();
        });

        // Logout handler
        logoutButton.addEventListener('click', () => {
            authToken = '';
            sessionStorage.removeItem('api_key');
            adminModal.classList.add('hidden');
            lockAdmin();
            checkAuth();
        });

        // Check auth on load
        checkAuth();

        // DOM Elements
        const themeToggle = document.getElementById('themeToggle');
        const html = document.documentElement;
        const toggleAdvanced = document.getElementById('toggleAdvanced');
        const advancedOptions = document.getElementById('advancedOptions');
        const advancedIcon = document.getElementById('advancedIcon');
        const submitButton = document.getElementById('submitButton');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const initialPrompt = document.getElementById('initialPrompt');
        const aiImage = document.getElementById('aiImage');
        const downloadButton = document.getElementById('downloadButton');

        // Theme toggle
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            html.classList.add('dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeToggle.addEventListener('click', () => {
            if (html.classList.contains('dark')) {
                html.classList.remove('dark');
                localStorage.theme = 'light';
                themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                html.classList.add('dark');
                localStorage.theme = 'dark';
                themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
            }
        });

        // Advanced options toggle
        toggleAdvanced.addEventListener('click', () => {
            const hidden = advancedOptions.classList.toggle('hidden');
            toggleAdvanced.setAttribute('aria-expanded', String(!hidden));
            advancedIcon.classList.toggle('fa-chevron-down');
            advancedIcon.classList.toggle('fa-chevron-up');
        });

        // Slider value displays
        ['steps', 'guidance'].forEach(id => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(id + 'Value');
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        });

        // Random seed
        document.getElementById('randomSeed').addEventListener('click', () => {
            document.getElementById('seed').value = Math.floor(Math.random() * 4294967295);
        });

        // Model registry from the backend source of truth. Populates the
        // dropdown and drives per-model control visibility + slider bounds
        // so the UI can never offer a param the model drops (#50).
        let modelRegistry = [];
        const modelSelect = document.getElementById('model');
        const modelError = document.getElementById('modelError');
        const generateError = document.getElementById('generateError');

        function showGenerateError(message) {
            generateError.textContent = message;
            generateError.classList.remove('hidden');
        }

        function clearGenerateError() {
            generateError.textContent = '';
            generateError.classList.add('hidden');
        }

        function currentModelConfig() {
            return modelRegistry.find((m) => m.id === modelSelect.value) || null;
        }

        function setSlider(id, param, fallback) {
            const slider = document.getElementById(id);
            const label = document.getElementById(id + 'Value');
            const min = param && param.min !== undefined ? param.min : fallback.min;
            const max = param && param.max !== undefined ? param.max : fallback.max;
            const step = param && param.step !== undefined ? param.step : fallback.step;
            const def = param && param.default !== undefined ? param.default : fallback.def;
            slider.min = min;
            slider.max = max;
            slider.step = step;
            slider.value = Math.min(max, Math.max(min, def));
            label.textContent = slider.value + (id === 'width' || id === 'height' ? 'px' : '');
        }

        function applyModelControls() {
            const config = currentModelConfig();
            if (!config) return;
            const params = config.parameters || {};
            const limits = config.limits || {};
            const has = (key) => params[key] !== undefined;
            // Size sliders need width+height params; steps needs steps or
            // num_steps (backend parses both, payload maps via cfParam).
            const showSize = has('width') && has('height');
            const showSteps = has('steps') || has('num_steps');
            const showGuidance = has('guidance');
            const showNegative = has('negative_prompt');
            document.getElementById('sizeWrap').classList.toggle('hidden', !showSize);
            document.getElementById('stepsWrap').classList.toggle('hidden', !showSteps);
            document.getElementById('guidanceWrap').classList.toggle('hidden', !showGuidance);
            document.getElementById('negativePromptWrap').classList.toggle('hidden', !showNegative);
            if (showSize) {
                // #65: presets from the registry's supported-size list;
                // default 1024 square when listed, else first entry.
                const sizes = limits.supportedSizes || [];
                const sizeSelect = document.getElementById('size');
                sizeSelect.innerHTML = '';
                for (const s of sizes) {
                    const option = document.createElement('option');
                    option.value = s;
                    option.textContent = s;
                    sizeSelect.appendChild(option);
                }
                sizeSelect.value = sizes.includes('1024x1024') ? '1024x1024' : (sizes[0] || '');
            }
            if (showSteps) {
                setSlider('steps', params.steps || params.num_steps, { min: 1, max: limits.maxSteps || 20, step: 1, def: limits.defaultSteps || 4 });
            }
            if (showGuidance) {
                setSlider('guidance', params.guidance, { min: 1, max: 30, step: 0.5, def: 7.5 });
            }
        }

        async function loadModels() {
            try {
                const response = await fetch('/api/internal/models');
                if (!response.ok) throw new Error('HTTP ' + response.status);
                modelRegistry = await response.json();
                modelSelect.innerHTML = '';
                // Prompt-only UI: image-to-image-only models have no
                // input-image control, so exclude them (CodeRabbit + OCR).
                const textModels = modelRegistry.filter((m) =>
                    (m.taskTypes || []).includes('text-to-image')
                );
                for (const m of textModels) {
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.textContent = m.id;
                    modelSelect.appendChild(option);
                }
                applyModelControls();
            } catch (error) {
                modelError.textContent = 'Could not load models: ' + (error instanceof Error ? error.message : String(error));
                modelError.classList.remove('hidden');
            }
        }

        modelSelect.addEventListener('change', applyModelControls);
        loadModels();

        // Generate image
        submitButton.addEventListener('click', async () => {
            const model = modelSelect.value;
            const prompt = document.getElementById('prompt').value;
            const config = currentModelConfig();
            const params = (config && config.parameters) || {};
            const has = (key) => params[key] !== undefined;
            // Send only params the model declares: anything else would be
            // silently dropped by toCFPayload (#50). toCFPayload reads
            // params[num_steps] for num_steps models, so send the
            // declared key, not the UI alias (OCR: steps was still dead
            // on SDXL/Leonardo).
            const body = { model: model, prompt: prompt, n: parseInt(document.getElementById('n').value) };
            if (has('width') && has('height')) {
                body.size = document.getElementById('size').value;
            }
            if (has('num_steps')) {
                body.num_steps = parseInt(document.getElementById('steps').value);
            } else if (has('steps')) {
                body.steps = parseInt(document.getElementById('steps').value);
            }
            if (has('guidance')) {
                body.guidance = parseFloat(document.getElementById('guidance').value);
            }
            if (has('negative_prompt')) {
                body.negative_prompt = document.getElementById('negative_prompt').value;
            }
            const seed = document.getElementById('seed').value;
            if (seed) body.seed = parseInt(seed);

            if (!prompt.trim()) {
                showGenerateError('Please enter a prompt');
                return;
            }
            if (!model) {
                showGenerateError('Models are still loading — please wait');
                return;
            }

            // Show loading. Keep the last good image visible under the
            // overlay (Slice A): only hide it when nothing was generated
            // yet. Stale model/time are cleared so they can't mislead.
            // hadResult is read by the terminal paths below.
            // Show loading. Keep the last good image visible under the
            // overlay (Slice A): only hide it when nothing was generated
            // yet. Stale model/time are cleared so they can't mislead.
            // hadResult is read by the terminal paths below.
            clearGenerateError();
            const hadResult = !!currentImageUrl && !aiImage.classList.contains('hidden');
            // Stash the prior result BEFORE clearing: assigning src below
            // replaces the displayed source, so on failure we restore
            // these (review: capture-then-clear order matters).
            const priorSrc = aiImage.src;
            const priorModel = document.getElementById('usedModel').textContent;
            const priorTime = document.getElementById('generationTime').textContent;
            if (!hadResult) {
                initialPrompt.classList.add('hidden');
                aiImage.classList.add('hidden');
                downloadButton.classList.add('hidden');
            }
            document.getElementById('usedModel').textContent = '…';
            document.getElementById('generationTime').textContent = '…';
            submitButton.disabled = true;
            loadingOverlay.classList.remove('hidden');

            // Capture start time for duration calculation
            const startTime = Date.now();
            // Abort recovery: a stalled fetch/image must not leave the
            // button disabled forever (OCR). 120s covers slow inference.
            // The timer also drives the image-failure path: if the fetch
            // resolved but the image load stalls, neither onload nor
            // onerror fires, so detach both and fail explicitly (review).
            const controller = new AbortController();
            let restoring = false;
            // Terminal state (OCR final): once set by timeout, late
            // continuations must not mutate the UI.
            let settled = false;
            const finish = () => {
                settled = true;
                clearTimeout(abortTimer);
                loadingOverlay.classList.add('hidden');
                submitButton.disabled = false;
            };
            const imageFailed = () => {
                finish();
                if (hadResult && aiImage.src !== priorSrc) {
                    restoring = true;
                    aiImage.src = priorSrc;
                    document.getElementById('usedModel').textContent = priorModel;
                    document.getElementById('generationTime').textContent = priorTime;
                } else if (!hadResult) {
                    // No prior result: nothing to preserve. When hadResult
                    // is true but src never changed (timeout before URL
                    // assignment), the showing image stays untouched.
                    initialPrompt.classList.remove('hidden');
                    aiImage.classList.add('hidden');
                    downloadButton.classList.add('hidden');
                }
                showGenerateError('Could not load the generated image (expired or blocked URL)');
            };
            const abortTimer = setTimeout(() => {
                controller.abort();
                aiImage.onload = null;
                aiImage.onerror = null;
                imageFailed();
            }, 120000);

            try {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = 'Bearer ' + authToken;
                }
                const response = await fetch(API_BASE + '/images/generations', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                if (settled) return;
                if (!response.ok) {
                    if (response.status === 401) {
                        authToken = '';
                        sessionStorage.removeItem('api_key');
                        checkAuth();
                        throw new Error('Session expired. Please login again.');
                    }
                    const error = await response.json();
                    throw new Error(error.error?.message || 'Generation failed');
                }

                const data = await response.json();
                if (settled) return;
                const imageData = data.data[0];

                // Handle b64_json or url
                let imageUrl;
                if (imageData.b64_json) {
                    imageUrl = 'data:image/png;base64,' + imageData.b64_json;
                } else {
                    imageUrl = imageData.url;
                }

                // Calculate elapsed time
                const elapsed = Date.now() - startTime;
                const elapsedSeconds = (elapsed / 1000).toFixed(1);

                // Display image. Commit currentImageUrl only on load of
                // the pending URL: restoring the prior source after a
                // failed load also fires onload and must not commit.
                aiImage.onload = () => {
                    if (restoring) {
                        restoring = false;
                        return;
                    }
                    currentImageUrl = imageUrl;
                    finish();
                    initialPrompt.classList.add('hidden');
                    aiImage.classList.remove('hidden');
                    downloadButton.classList.remove('hidden');

                    // Update info
                    document.getElementById('usedModel').textContent = model;
                    document.getElementById('generationTime').textContent = elapsedSeconds + 's';
                };
                // Expired/blocked R2 URLs never fire onload: without
                // onerror the spinner would run forever (#50 B4).
                // Restore the prior source so the last good image
                // survives a failed load (Slice A + OCR).
                aiImage.onerror = () => {
                    restoring = false;
                    imageFailed();
                };
                if (settled) return;
                aiImage.src = imageUrl;

            } catch (error) {
                finish();
                if (hadResult) {
                    // Prior result still showing: restore its meta instead
                    // of leaving the loading placeholders (review).
                    document.getElementById('usedModel').textContent = priorModel;
                    document.getElementById('generationTime').textContent = priorTime;
                } else {
                    initialPrompt.classList.remove('hidden');
                }
                if (error instanceof DOMException && error.name === 'AbortError') {
                    showGenerateError('Error: generation timed out after 120s — please retry');
                } else {
                    showGenerateError('Error: ' + (error instanceof Error ? error.message : String(error)));
                }
            }
        });

        // ---- Provider Credentials (admin, R2 #74) ----
        // The management key lives in memory only: never persisted, never
        // logged. Key rows render labels + flags; tokens travel one way
        // (add/rotate request bodies) and are cleared from the inputs and
        // any in-memory reference immediately after the fetch resolves.
        let adminKey = '';
        const adminKeyInput = document.getElementById('adminKey');
        const adminUnlock = document.getElementById('adminUnlock');
        const adminLock = document.getElementById('adminLock');
        const adminError = document.getElementById('adminError');
        const adminNotice = document.getElementById('adminNotice');
        const adminPanel = document.getElementById('adminPanel');
        const adminKeys = document.getElementById('adminKeys');
        const adminHealthState = document.getElementById('adminHealthState');
        const newKeyLabel = document.getElementById('newKeyLabel');
        const newKeyToken = document.getElementById('newKeyToken');
        const newKeyProvider = document.getElementById('newKeyProvider');
        const addKeyButton = document.getElementById('addKeyButton');

        function adminHeaders() {
            return {
                'Authorization': 'Bearer ' + authToken,
                'X-Admin-Key': adminKey,
                'Content-Type': 'application/json',
            };
        }

        function showAdminError(message) {
            adminError.textContent = message;
            adminError.classList.remove('hidden');
        }

        function clearAdminError() {
            adminError.textContent = '';
            adminError.classList.add('hidden');
        }

        function showAdminNotice(message) {
            adminNotice.textContent = message;
            adminNotice.classList.remove('hidden');
        }

        function lockAdmin(keepError = false) {
            adminKey = '';
            if (adminKeyInput) adminKeyInput.value = '';
            if (newKeyToken) newKeyToken.value = '';
            adminPanel.classList.add('hidden');
            adminLock.classList.add('hidden');
            adminUnlock.classList.remove('hidden');
            adminHealthState.textContent = '';
            adminKeys.innerHTML = '';
            if (!keepError) clearAdminError();
        }

        function renderKeys(keys) {
            adminKeys.innerHTML = '';
            for (const k of keys) {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-between gap-2 text-sm border rounded p-2';
                const name = document.createElement('span');
                // textContent, never innerHTML: labels come from the store.
                name.textContent = k.label + ' (' + k.providerId + ') v' + (k.activeVersion ?? '?') + (k.enabled ? '' : ' — disabled');
                const actions = document.createElement('div');
                actions.className = 'flex gap-2';
                if (k.enabled) {
                    const rotateBtn = document.createElement('button');
                    rotateBtn.className = 'btn btn-secondary text-xs py-1 px-2';
                    rotateBtn.textContent = 'Rotate';
                    rotateBtn.addEventListener('click', () => rotateKey(k.id));
                    actions.appendChild(rotateBtn);
                    const disableBtn = document.createElement('button');
                    disableBtn.className = 'btn btn-secondary text-xs py-1 px-2';
                    disableBtn.textContent = 'Disable';
                    disableBtn.addEventListener('click', () => disableKey(k.id));
                    actions.appendChild(disableBtn);
                }
                row.appendChild(name);
                row.appendChild(actions);
                adminKeys.appendChild(row);
            }
        }

        async function refreshAdmin() {
            try {
                const response = await fetch('/api/admin/health', { headers: adminHeaders() });
                if (response.status === 401) { lockAdmin(true); showAdminError('API key rejected — log in again.'); return; }
                if (response.status === 403) { lockAdmin(true); showAdminError('Wrong management key.'); return; }
                if (!response.ok) { showAdminError('Health check failed: ' + response.status); return; }
                const health = await response.json();
                adminHealthState.textContent = 'config v' + health.configVersion + ' · ' + health.keys.length + ' key(s)';
                newKeyProvider.innerHTML = '';
                for (const p of health.providers) {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.displayName || p.id;
                    newKeyProvider.appendChild(opt);
                }
                renderKeys(health.keys);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                showAdminError('Network error loading admin health: ' + (msg || 'unknown error'));
            }
        }

        async function unlockAdmin() {
            clearAdminError();
            adminKey = adminKeyInput.value;
            if (adminKeyInput) adminKeyInput.value = '';
            if (!adminKey) { showAdminError('Enter the management key.'); return; }
            adminPanel.classList.remove('hidden');
            adminLock.classList.remove('hidden');
            adminUnlock.classList.add('hidden');
            await refreshAdmin();
        }

        async function addKey() {
            clearAdminError();
            adminNotice.classList.add('hidden');
            const label = newKeyLabel.value.trim();
            let token = newKeyToken.value;
            const providerId = newKeyProvider.value;
            if (!label || !token) { showAdminError('Label and API token are required.'); return; }
            try {
                const response = await fetch('/api/admin/keys', {
                    method: 'POST',
                    headers: adminHeaders(),
                    body: JSON.stringify({ providerId, label, apiToken: token }),
                });
                if (response.status === 401) { lockAdmin(true); showAdminError('API key rejected — log in again.'); return; }
                if (response.status === 403) { lockAdmin(true); showAdminError('Wrong management key.'); return; }
                if (response.status === 409) { showAdminError('That label already exists.'); return; }
                if (!response.ok) { showAdminError('Add failed: ' + response.status); return; }
                const created = await response.json();
                token = '';
                newKeyToken.value = '';
                newKeyLabel.value = '';
                showAdminNotice('Added ' + created.label + ' (v' + created.activeVersion + ').');
                await refreshAdmin();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                showAdminError('Network error adding key: ' + (msg || 'unknown error'));
            } finally {
                newKeyToken.value = '';
            }
        }

        async function rotateKey(id) {
            let token = window.prompt('New API token for key ' + id + ':');
            if (!token) return;
            clearAdminError();
            adminNotice.classList.add('hidden');
            try {
                const response = await fetch('/api/admin/keys/' + id + '/rotate', {
                    method: 'POST',
                    headers: adminHeaders(),
                    body: JSON.stringify({ apiToken: token }),
                });
                if (response.status === 401) { lockAdmin(true); showAdminError('API key rejected — log in again.'); return; }
                if (response.status === 403) { lockAdmin(true); showAdminError('Wrong management key.'); return; }
                if (response.status === 404) { showAdminError('Key not found.'); return; }
                if (!response.ok) { showAdminError('Rotate failed: ' + response.status); return; }
                const rotated = await response.json();
                token = null;
                showAdminNotice('Rotated to v' + rotated.activeVersion + '.');
                await refreshAdmin();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                showAdminError('Network error rotating key: ' + (msg || 'unknown error'));
            } finally {
                token = null;
            }
        }

        async function disableKey(id) {
            if (!window.confirm('Disable key ' + id + '? It stays stored but is no longer served.')) return;
            clearAdminError();
            adminNotice.classList.add('hidden');
            try {
                const response = await fetch('/api/admin/keys/' + id + '/disable', {
                    method: 'POST',
                    headers: adminHeaders(),
                });
                if (response.status === 401) { lockAdmin(true); showAdminError('API key rejected — log in again.'); return; }
                if (response.status === 403) { lockAdmin(true); showAdminError('Wrong management key.'); return; }
                if (!response.ok) { showAdminError('Disable failed: ' + response.status); return; }
                showAdminNotice('Key disabled.');
                await refreshAdmin();
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                showAdminError('Network error disabling key: ' + (msg || 'unknown error'));
            }
        }

        adminUnlock.addEventListener('click', unlockAdmin);
        adminLock.addEventListener('click', lockAdmin);
        addKeyButton.addEventListener('click', addKey);
        adminKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') unlockAdmin();
        });

        // Admin modal controls
        adminModalButton.addEventListener('click', () => {
            clearAdminError();
            adminModal.classList.remove('hidden');
            if (adminKeyInput && !adminKey) adminKeyInput.focus();
        });
        adminModalClose.addEventListener('click', () => {
            adminModal.classList.add('hidden');
        });
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) adminModal.classList.add('hidden');
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !adminModal.classList.contains('hidden')) {
                adminModal.classList.add('hidden');
            }
        });

        // Download image
        downloadButton.addEventListener('click', async () => {
            if (!currentImageUrl) return;

            try {
                const response = await fetch(currentImageUrl);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'image-' + Date.now() + '.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                showGenerateError('Download failed: ' + (error instanceof Error ? error.message : String(error)));
            }
        });
    </script>
</body>
</html>`;
}

export function serveFrontend(): Response {
  return new Response(getFrontendHTML(), {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}
