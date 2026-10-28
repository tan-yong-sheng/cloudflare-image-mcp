// ============================================================================
// Frontend HTML Template
// Responsive web UI for image generation
// ============================================================================

import { AGNES_LOGO_DATA_URI } from "../config/brand.js";

export function getFrontendHTML(options?: {
  hasCredentials?: boolean;
}): string {
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

        /* Provider brand mark. Sized in em so it tracks the family name's
           font-size, the way a Font Awesome glyph does. */
        .family-mark {
            width: 1.15em;
            height: 1.15em;
            object-fit: contain;
            flex-shrink: 0;
        }

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

        .btn-danger {
            background-color: transparent;
            color: var(--error);
            border: 1px solid var(--border);
        }

        .btn-danger:hover {
            background-color: var(--error);
            color: white;
            border-color: var(--error);
            transform: translateY(-1px);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
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
            font-size: 1rem;
            line-height: 1.5;
            min-height: 2.5rem;
            transition: all 0.3s ease;
            width: 100%;
        }

        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(80, 70, 229, 0.1);
        }

        /* The range input needs a box the same height as the size dropdown,
           with the track drawn thin and centred inside it. The shared
           input rule above would otherwise give it 40px of padding and a
           full-size background, which is what made the track look like a
           fat rectangle with a small circle on it. */
        .slider {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 2.5rem;
            min-height: 2.5rem;
            padding: 0;
            border: 1px solid transparent;
            background: transparent;
            outline: none;
            margin: 0;
            cursor: pointer;
        }

        .slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 999px;
            background: var(--border);
        }

        .slider::-moz-range-track {
            height: 6px;
            border-radius: 999px;
            background: var(--border);
        }

        .slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            /* Centre an 18px thumb on the 6px track: (6 - 18) / 2. */
            margin-top: -6px;
            border: none;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border: none;
            border-radius: 50%;
            background: var(--primary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        /* The seed field and its randomise button sit in one flex row: the
           button's own padding made the row 54px tall, and the input
           stretched to match. Pin both to the shared control height so the
           row lines up with Size and Steps. */
        #seed,
        #randomSeed {
            height: 2.5rem;
            min-height: 2.5rem;
        }

        #randomSeed {
            padding: 0 0.75rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
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

        /* Provider credentials workbench (variant A, #91) */
        .chip { font-size: .72rem; padding: .15rem .55rem; border-radius: 9999px; border: 1px solid var(--border); }
        .chip-ok { background: rgba(16,185,129,.15); border-color: var(--success); color: var(--success); }
        .tswitch { position: relative; display: inline-block; width: 34px; height: 19px; flex: none; cursor: pointer; }
        .tswitch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
        .tswitch .track { position: absolute; inset: 0; border-radius: 9999px; background: var(--secondary); border: 1px solid var(--border); transition: background .2s, border-color .2s; }
        .tswitch .thumb { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 9999px; background: var(--text-light); transition: left .2s, background .2s; }
        .tswitch input:checked + .track { background: rgba(16,185,129,.35); border-color: var(--success); }
        .tswitch input:checked + .track .thumb { left: 17px; background: var(--success); }
        .tswitch input:focus-visible + .track { outline: 2px solid var(--primary); outline-offset: 2px; }

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

    <!-- Provider Credentials Workbench (full-page view, #91) -->
    <main id="adminView" class="container mx-auto px-4 py-4 max-w-6xl hidden" role="main" aria-labelledby="adminViewTitle">
        <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-700">
            <div class="flex items-center space-x-3">
                <button id="adminBackBtn" class="btn btn-secondary p-2 h-10 flex items-center justify-center rounded" aria-label="Back to Image Generator">
                    <i class="fa-solid fa-arrow-left mr-2"></i>Back
                </button>
            </div>
            <div class="flex items-center space-x-2">
                <span id="adminChipsActive" class="chip chip-ok hidden"></span>
                <span id="adminChipsFamilies" class="chip hidden"></span>
                <button id="adminLock" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Lock provider credentials">
                    <i class="fa-solid fa-lock mr-2"></i>Lock
                </button>
                <button id="themeToggleAdmin" class="btn btn-secondary p-2 h-10 w-10 flex items-center justify-center" aria-label="Toggle dark theme">
                    <i class="fa-solid fa-moon"></i>
                </button>
                <button id="logoutButtonAdmin" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Logout">
                    <i class="fa-solid fa-sign-out-alt mr-2"></i>Logout
                </button>
            </div>
        </div>

        <p id="adminNotice" class="text-sm p-3 mb-4 rounded bg-green-900/30 text-green-300 border border-green-700 hidden" role="status"></p>

        <!-- Unlock Gate (shown when locked) -->
        <div id="adminGate" class="max-w-md mx-auto my-12">
            <div class="card p-6 space-y-4">
                <div class="text-center space-y-1">
                    <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-2">
                        <i class="fa-solid fa-shield-halved text-xl"></i>
                    </div>
                    <h2 class="text-lg font-bold">Unlock Provider Administration</h2>
                    <p class="text-xs opacity-60">Enter your management key to inspect and configure provider credentials.</p>
                </div>
                <div class="space-y-2">
                    <label for="adminKey" class="block text-xs font-medium">Management key</label>
                    <input type="password" id="adminKey" class="w-full" placeholder="Management key (never stored)" autocomplete="off">
                    <p id="adminError" class="text-xs text-red-500 hidden" role="alert"></p>
                </div>
                <button id="adminUnlock" class="btn btn-primary w-full py-2 flex items-center justify-center">
                    <i class="fa-solid fa-unlock mr-2"></i>Unlock
                </button>
            </div>
        </div>

        <!-- Operational Panel (shown when unlocked) -->
        <div id="adminPanel" class="hidden space-y-4">
            <div class="flex flex-col md:flex-row gap-6">
                <aside class="card p-4 md:w-64 flex-shrink-0" aria-label="Provider families">
                    <h1 id="adminViewTitle" class="text-xl font-bold flex items-center mb-4 pb-3 border-b border-gray-700">
                        <i class="fa-solid fa-server mr-2 text-primary"></i>AI Providers
                    </h1>
                    <div id="adminRail" class="space-y-1"></div>
                </aside>
                <section class="card p-6 flex-1 min-w-0">
                    <div class="mb-4 pb-3 border-b border-gray-700 flex items-center justify-between">
                        <h3 id="adminFamilyName" class="font-semibold text-lg flex items-center"></h3>
                        <button id="adminAddKey" class="btn btn-primary text-sm py-1.5 px-4 hidden" aria-label="Add new provider key">
                            <i class="fa-solid fa-plus mr-1"></i>New key
                        </button>
                    </div>
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="text-left opacity-60 border-b border-gray-800">
                                <th id="adminKeysHead" class="p-3 font-medium">Key</th>
                                <th id="adminAcctHead" class="p-3 font-medium">Account ID</th>
                                <th class="p-3 font-medium"><span class="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody id="adminKeys"></tbody>
                    </table>
                    <p id="adminEmpty" class="text-sm opacity-60 text-center py-10 hidden">No keys yet.</p>
                </section>
            </div>
        </div>
    </div>

    <!-- Workbench add/edit sheet (right-docked, #91) -->
    <div id="adminSheet" class="fixed inset-0 flex items-stretch justify-end z-50 hidden" style="background:rgba(0,0,0,.55)" role="dialog" aria-modal="true" aria-labelledby="adminSheetTitle">
        <div class="card p-6 w-full flex flex-col" style="max-width:30rem;height:100%;overflow-y:auto;border-radius:0;border-top:0;border-right:0;border-bottom:0">
            <p id="adminSheetEyebrow" class="text-xs opacity-60 font-mono mb-1"></p>
            <h3 id="adminSheetTitle" class="text-lg font-bold mb-1"></h3>
            <p id="adminSheetNote" class="text-xs opacity-60 mb-3"></p>
            <div class="space-y-3 flex-1">
                <div id="adminSheetAcctField">
                    <label for="adminSheetAcct" class="block text-xs opacity-60 mb-1">Cloudflare account ID</label>
                    <input id="adminSheetAcct" class="w-full" placeholder="e.g. abc123def456" autocomplete="off" autocapitalize="off" spellcheck="false">
                    <p class="text-xs opacity-60 mt-1">Required — inference calls <code>/accounts/{account_id}/ai/run/…</code>. Stored alongside the key (not sealed).</p>
                </div>
                <div>
                    <label for="adminSheetToken" class="block text-xs opacity-60 mb-1">API token <span id="adminSheetTokenHint" class="opacity-60"></span></label>
                    <div class="flex gap-2">
                        <input type="password" id="adminSheetToken" class="w-full" autocomplete="new-password" data-1p-ignore="true" placeholder="">
                        <button id="adminSheetTokenEye" class="btn btn-secondary p-2" aria-label="Show token" title="Show token"><i class="fa-solid fa-eye"></i></button>
                    </div>
                </div>
                <div class="flex gap-3 items-end">
                    <div class="flex-1">
                        <label for="adminSheetWeight" class="block text-xs opacity-60 mb-1">Scheduling weight</label>
                        <input type="number" id="adminSheetWeight" class="w-full" min="0" max="1000000" step="1" placeholder="1">
                    </div>
                    <label class="flex gap-2 items-center text-xs pb-2"><input type="checkbox" id="adminSheetEnabled" style="width:auto"> Enabled <span class="opacity-60">— uncheck to park the key</span></label>
                </div>
                <p class="text-xs opacity-60">Default 1 · ≤ 0 is excluded · maximum 1,000,000.</p>
                <p id="adminSheetError" class="text-sm text-red-500 hidden" role="alert"></p>
            </div>
            <div class="flex gap-2 mt-4 justify-end">
                <button id="adminSheetCancel" class="btn btn-secondary text-sm py-1 px-3">Cancel</button>
                <button id="adminSheetSave" class="btn btn-primary text-sm py-1 px-3">Add key</button>
            </div>
        </div>
    </main>

    <main id="generatorView" class="container mx-auto px-4 py-4 max-w-6xl">
        <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl md:text-3xl font-bold flex items-center">
                <i class="fa-solid fa-image mr-2"></i>AI Image Generator
            </h1>
            <div class="flex items-center space-x-2">
                <button id="adminWorkbenchButton" class="btn btn-secondary p-2 h-10 flex items-center justify-center hidden" aria-label="Manage provider credentials">
                    <i class="fa-solid fa-key mr-2"></i>Admin
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
                                <i class="fa-solid fa-expand mr-1"></i>Size (W × H)
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

                <p id="noKeysWarning" class="text-sm p-3 mb-3 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-700 hidden" role="alert">
                    <i class="fa-solid fa-triangle-exclamation mr-2"></i>No API keys configured. <a href="#admin" class="underline hover:text-yellow-200">Set up credentials</a> in the admin panel first.
                </p>

                <button id="submitButton" class="btn btn-primary w-full py-3 flex items-center justify-center">
                    <i class="fa-solid fa-wand-magic-sparkles mr-2"></i>Generate Image
                </button>
            </div>

            <!-- Right Image Display -->
            <div class="w-full lg:w-3/5">
                <div class="card h-full p-4 space-y-4 fade-in">
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
    </main>

    <script>
        // Configuration
        const API_BASE = '/v1';

        // Credential readiness, baked at render time (ADR-001). The
        // generator runs before login and /api/admin/health is gated, so a
        // client fetch cannot tell an unconfigured pool from a 401/403.
        // The admin workbench refreshes this from the health payload it is
        // already authenticated to read.
        const HAS_CREDENTIALS = ${options?.hasCredentials === true ? "true" : "false"};

        // State
        let currentImageUrl = null;
        let authToken = sessionStorage.getItem('api_key') || '';

        // Auth Elements
        const loginModal = document.getElementById('loginModal');
        const passwordInput = document.getElementById('password');
        const loginButton = document.getElementById('loginButton');
        const loginError = document.getElementById('loginError');
        const logoutButton = document.getElementById('logoutButton');

        // Check auth status on load
        function checkAuth() {
            if (authToken) {
                loginModal.classList.add('hidden');
                logoutButton.classList.remove('hidden');
            } else {
                loginModal.classList.remove('hidden');
                logoutButton.classList.add('hidden');
            }
            window.dispatchEvent(new CustomEvent('awb-authchange', { detail: { authed: !!authToken } }));
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
        const noKeysWarning = document.getElementById('noKeysWarning');
        const modelSelect = document.getElementById('model');

        let credentialsConfigured = HAS_CREDENTIALS;
        // Models whose provider holds a servable key. The picker offers
        // nothing until one does, so a blank select is the honest empty
        // state rather than a list of models that cannot run.
        let selectableModels = 0;
        // Survives a failed refetch so a transient error does not also
        // discard the model the user had picked.
        let lastModelValue = '';
        // Sequence token for loadModels: a health render can start a second
        // refetch while the first is in flight, and the older response must
        // not overwrite the newer list.
        let modelRequest = 0;
        // A generation in flight keeps Submit disabled: render(health) reruns
        // the predicate below, and without this a health refetch arriving
        // mid-request would re-enable the button and allow a duplicate POST.
        let inFlight = false;
        function applyCredentialWarning() {
            noKeysWarning.classList.toggle('hidden', credentialsConfigured);
            // No credentials, or no model the request path would accept:
            // both leave generation impossible, so the button matches the
            // disabled picker instead of looking actionable.
            submitButton.disabled =
                inFlight || !credentialsConfigured || selectableModels === 0;
            // Grey the model picker too: an unconfigured pool must not offer
            // a model the user then cannot generate with.
            modelSelect.disabled = !credentialsConfigured || selectableModels === 0;
            modelSelect.classList.toggle('opacity-60', modelSelect.disabled);
            if (modelSelect.disabled) {
                modelSelect.title = credentialsConfigured
                    ? 'No model available for the configured keys'
                    : 'No API keys configured';
            } else {
                modelSelect.removeAttribute('title');
            }
            if (credentialsConfigured) {
                submitButton.removeAttribute('title');
            } else {
                submitButton.title = 'No API keys configured';
            }
        }
        function setCredentialsConfigured(hasCredentials) {
            credentialsConfigured = hasCredentials;
            applyCredentialWarning();
        }
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
            // Size control: width+height models drive it from their bounds,
            // and Agnes models declare a single size parameter instead
            // (2.0 takes an exact WxH, 2.5/2.1 a tier-mapped WxH), so the
            // same select serves both shapes.
            const showSize = (has('width') && has('height')) || has('size');
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
            const request = ++modelRequest;
            try {
                const response = await fetch('/api/internal/models');
                if (!response.ok) throw new Error('HTTP ' + response.status);
                modelRegistry = await response.json();
                if (request !== modelRequest) return;
                const previous = modelSelect.value || lastModelValue;
                modelSelect.innerHTML = '';
                // Prompt-only UI: image-to-image-only models have no
                // input-image control, so exclude them (CodeRabbit + OCR).
                // Also exclude models whose provider has no servable key:
                // the available flag is the routing predicate, so the
                // picker can never offer a model the request path refuses.
                const textModels = modelRegistry.filter((m) =>
                    (m.taskTypes || []).includes('text-to-image') && m.available === true
                );
                for (const m of textModels) {
                    const option = document.createElement('option');
                    option.value = m.id;
                    option.textContent = m.id;
                    modelSelect.appendChild(option);
                }
                selectableModels = textModels.length;
                // Keep the user's choice across a reload (adding a key
                // refetches this list); it only moves if it is gone.
                if (previous && textModels.some((m) => m.id === previous)) {
                    modelSelect.value = previous;
                }
                lastModelValue = modelSelect.value;
                modelError.classList.add('hidden');
                applyCredentialWarning();
                applyModelControls();
            } catch (error) {
                // A newer refetch already owns the list and the error line.
                if (request !== modelRequest) return;
                // A failed refetch must not leave a stale list on screen: those
                // options may no longer be servable, and offering one is how a
                // blank-picker state ends up submitting anyway. Drop them and
                // keep the choice for the next successful load.
                lastModelValue = modelSelect.value || lastModelValue;
                modelSelect.innerHTML = '';
                selectableModels = 0;
                applyCredentialWarning();
                modelError.textContent = 'Could not load models: ' + (error instanceof Error ? error.message : String(error));
                modelError.classList.remove('hidden');
            }
        }

        modelSelect.addEventListener('change', applyModelControls);
        loadModels();

        // No credentials: warn before the user can hit the failing path.
        applyCredentialWarning();

        // Generate image
        submitButton.addEventListener('click', async () => {
            // The button may be disabled by the time the click handler fires
            // (e.g. the DOM shim in tests calls listeners regardless of
            // disabled, and a browser that queued the event before the flag
            // flipped is equivalent). Guard here so a mid-flight click does
            // not start a second generation request.
            if (submitButton.disabled) return;
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
            if ((has('width') && has('height')) || has('size')) {
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
            inFlight = true;
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
                inFlight = false;
                clearTimeout(abortTimer);
                loadingOverlay.classList.add('hidden');
                // Same predicate as the initial state: readiness and a
                // selectable model, so a completed run cannot re-enable a
                // picker that has since emptied.
                applyCredentialWarning();
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
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    // ADR-001: Improve error message for missing credentials
                    if (!errorMsg || errorMsg === 'null' || errorMsg === 'undefined') {
                        showGenerateError('Image generation failed. Please check your API credentials in the admin panel.');
                    } else {
                        showGenerateError('Error: ' + errorMsg);
                    }
                }
            }
        });

        // Download image
        downloadButton.addEventListener('click', async () => {
            if (!currentImageUrl) return;

            const name = 'image-' + Date.now() + '.png';
            const save = (href) => {
                const link = document.createElement('a');
                link.href = href;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };

            // A data URI is already the image: fetching it back would only
            // copy bytes in memory for no gain.
            if (currentImageUrl.startsWith('data:')) {
                save(currentImageUrl);
                return;
            }

            // The stored URL is absolute and built from the request origin.
            // Served through a proxy or a custom domain, that origin can
            // differ from the one the page loaded from — so the fetch is
            // cross-origin and the download attribute would be ignored.
            // Fetch first (which also gives the file a real name), then fall
            // back to opening the URL rather than reporting a failure the
            // operator cannot act on.
            try {
                const response = await fetch(currentImageUrl);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                save(url);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                const opened = window.open(currentImageUrl, '_blank');
                if (!opened) {
                    showGenerateError(
                        'Download failed: ' + (error instanceof Error ? error.message : String(error)) +
                        '. Open the image in a new tab to save it.'
                    );
                }
            }
        });
        // Provider credentials workbench (full-page SPA view, #91)
        (function () {
            const button = document.getElementById('adminWorkbenchButton');
            const adminView = document.getElementById('adminView');
            const backBtn = document.getElementById('adminBackBtn');
            const generatorView = document.getElementById('generatorView');
            const gate = document.getElementById('adminGate');
            const keyInput = document.getElementById('adminKey');
            const unlockBtn = document.getElementById('adminUnlock');
            const lockBtn = document.getElementById('adminLock');
            const errorLine = document.getElementById('adminError');
            const noticeLine = document.getElementById('adminNotice');
            const panel = document.getElementById('adminPanel');
            const rail = document.getElementById('adminRail');
            const familyName = document.getElementById('adminFamilyName');
            const keysBody = document.getElementById('adminKeys');
            const keysHead = document.getElementById('adminKeysHead');
            const acctHead = document.getElementById('adminAcctHead');
            const emptyLine = document.getElementById('adminEmpty');
            const addKeyBtn = document.getElementById('adminAddKey');
            const chipsActive = document.getElementById('adminChipsActive');
            const chipsFamilies = document.getElementById('adminChipsFamilies');
            const sheet = document.getElementById('adminSheet');
            const sheetEyebrow = document.getElementById('adminSheetEyebrow');
            const sheetTitle = document.getElementById('adminSheetTitle');
            const sheetNote = document.getElementById('adminSheetNote');
            const sheetAcctField = document.getElementById('adminSheetAcctField');
            const sheetAcct = document.getElementById('adminSheetAcct');
            const sheetToken = document.getElementById('adminSheetToken');
            const sheetTokenHint = document.getElementById('adminSheetTokenHint');
            const sheetTokenEye = document.getElementById('adminSheetTokenEye');
            const sheetWeight = document.getElementById('adminSheetWeight');
            const sheetEnabled = document.getElementById('adminSheetEnabled');
            const sheetError = document.getElementById('adminSheetError');
            const sheetCancel = document.getElementById('adminSheetCancel');
            const sheetSave = document.getElementById('adminSheetSave');
            const themeToggleAdmin = document.getElementById('themeToggleAdmin');
            const logoutButtonAdmin = document.getElementById('logoutButtonAdmin');

            // The management key lives in memory only: never persisted,
            // never logged. Cleared on lock, modal close, and logout.
            // Admin routes the worker serves. index.test.ts pins these to the
            // server's constants, so a rename on either side fails a test.
            const ADMIN_HEALTH = '/api/admin/health';
            const ADMIN_KEYS = '/api/admin/keys';

            let adminKey = '';
            let adminRequestGeneration = 0;
            let sheetGeneration = 0;
            let selected = '';
            let sheetKeyId = null;
            let lastHealth = null;

            function showError(el, message) { el.textContent = message; el.classList.remove('hidden'); }
            function hideError(el) { el.textContent = ''; el.classList.add('hidden'); }
            function showNotice(message) {
                noticeLine.textContent = message;
                noticeLine.classList.remove('hidden');
                setTimeout(() => { noticeLine.textContent = ''; noticeLine.classList.add('hidden'); }, 4000);
            }

            function headers() {
                const h = { 'Content-Type': 'application/json' };
                if (authToken) h['Authorization'] = 'Bearer ' + authToken;
                if (adminKey) h['X-Admin-Key'] = adminKey;
                return h;
            }

            async function api(method, path, body) {
                const generation = adminRequestGeneration;
                // Locked or logged out while this was in flight: the request may
                // already have reached the server, but its result must not drive
                // the UI after the management key was cleared.
                const stale = { ok: false, status: 0, data: null, stale: true };
                let response;
                try {
                    response = await fetch(path, {
                        method: method,
                        headers: headers(),
                        body: body === undefined ? undefined : JSON.stringify(body)
                    });
                } catch (error) {
                    // A rejection after lock/logout is stale as well; every other
                    // failure still reaches the caller's error handling.
                    if (generation !== adminRequestGeneration) return stale;
                    throw error;
                }
                if (generation !== adminRequestGeneration) return stale;
                let text;
                try {
                    text = await response.text();
                } catch (error) {
                    // A body read that fails after lock/logout is stale too.
                    if (generation !== adminRequestGeneration) return stale;
                    throw error;
                }
                let data = null;
                try { data = text ? JSON.parse(text) : null; } catch (error) { data = null; }
                // Reading the body is asynchronous too, so a lock can land
                // between the check above and this one.
                if (generation !== adminRequestGeneration) return stale;
                return { ok: response.ok, status: response.status, data: data };
            }

            function errorMessage(res) {
                const message = res.data && res.data.error && typeof res.data.error.message === 'string' ? res.data.error.message : '';
                return message || ('Request failed (' + res.status + ')');
            }

            function lock() {
                adminRequestGeneration += 1;
                adminKey = '';
                keyInput.value = '';
                unlockBtn.classList.remove('hidden');
                lockBtn.classList.add('hidden');
                panel.classList.add('hidden');
                chipsActive.classList.add('hidden');
                chipsFamilies.classList.add('hidden');
                if (gate) gate.classList.remove('hidden');
                closeSheet();
                hideError(errorLine);
            }

            function showAdminView() {
                generatorView.classList.add('hidden');
                adminView.classList.remove('hidden');
                hideError(errorLine);
                window.scrollTo({ top: 0, behavior: 'instant' });
                
                if (adminKey) {
                    gate.classList.add('hidden');
                    panel.classList.remove('hidden');
                    lockBtn.classList.remove('hidden');
                    chipsActive.classList.remove('hidden');
                    chipsFamilies.classList.remove('hidden');
                    loadHealth();
                } else {
                    gate.classList.remove('hidden');
                    panel.classList.add('hidden');
                    lockBtn.classList.add('hidden');
                    chipsActive.classList.add('hidden');
                    chipsFamilies.classList.add('hidden');
                    keyInput.focus();
                }
            }

            function showGeneratorView() {
                adminView.classList.add('hidden');
                generatorView.classList.remove('hidden');
                lock();
            }

            function syncRoute() {
                if (window.location.hash === '#admin') {
                    showAdminView();
                } else {
                    showGeneratorView();
                }
            }

            // /admin is routed here as the workbench's addressable path, but
            // the view itself is hash-routed (design-plans/005: a real page
            // navigation cannot carry the two auth headers, so the workbench
            // lives in this shell). Adopt the fragment instead of branching
            // the view logic on the path, which keeps one routing source and
            // leaves the back button working. replaceState, not assignment:
            // this is not a navigation the user made.
            if (window.location.pathname === '/admin' && window.location.hash !== '#admin') {
                history.replaceState(null, '', '/admin#admin');
            }

            async function loadHealth() {
                let res;
                try {
                    res = await api('GET', ADMIN_HEALTH);
                    if (res.stale) return;
                } catch (error) {
                    showError(errorLine, error instanceof Error ? error.message : String(error));
                    return;
                }
                if (!res.ok) {
                    if (res.status === 403) {
                        lock();
                        // A disabled admin gate is not the operator's key
                        // being wrong, so show the server's reason when it
                        // says which it was.
                        const denied = res.data && res.data.error ? res.data.error : null;
                        const reason = denied && denied.code === 'admin_disabled' && typeof denied.message === 'string' ? denied.message : '';
                        showError(errorLine, reason || 'Management key rejected.');
                        return;
                    }
                    showError(errorLine, errorMessage(res));
                    return;
                }
                if (!res.data || !Array.isArray(res.data.keys) || !Array.isArray(res.data.providers)) {
                    showError(errorLine, 'Unexpected health response.');
                    return;
                }
                hideError(errorLine);
                render(res.data);
            }

            function render(health) {
                lastHealth = health;
                const providers = health.providers;
                const keys = health.keys;
                // Authenticated truth from the server: the same servable
                // predicate the pool uses (enabled, weighted, envelope
                // opens), so the warning cannot disagree with generation.
                setCredentialsConfigured(health.hasServableCredential === true);
                // Key mutations land here, and they change which providers
                // can serve, so the model list is refetched with the same
                // freshness as the health read it came from.
                loadModels();
                if (!selected || !providers.some((p) => p.id === selected)) {
                    selected = providers.length ? providers[0].id : '';
                }
                chipsActive.textContent = keys.filter((k) => k.enabled).length + '/' + keys.length + ' active keys';
                chipsFamilies.textContent = providers.length + (providers.length === 1 ? ' provider family' : ' provider families');
                // Show/hide the New key button based on whether a provider is selected
                addKeyBtn.classList.toggle('hidden', !selected);
                renderRail(providers, keys);
                renderTable(providers, keys);
            }

            // Only cloudflare-rest addresses keys through /accounts/{id}/ai/run,
            // so external_account_id is a field of that transport, not of a
            // provider name. Routing it off the transport (ADR-002) keeps a
            // future non-Cloudflare provider from inheriting the field.
            function needsAccountId(providerId) {
                const family = (lastHealth && lastHealth.providers || []).find((p) => p.id === providerId);
                return !!family && family.transport === 'cloudflare-rest';
            }

            // Cloudflare ships a brand mark in Font Awesome. Agnes ships an
            // app icon, inlined as a data URI so the mark adds no new
            // third-party origin (see config/brand.ts).
            const FAMILY_ICONS = { cloudflare: 'fa-brands fa-cloudflare' };
            const FAMILY_LOGOS = { agnes: '${AGNES_LOGO_DATA_URI}' };
            function familyIcon(providerId) {
                // Own-property lookups: a provider id such as "constructor"
                // would otherwise resolve through Object.prototype and take
                // the logo branch with a function value.
                const logo = Object.hasOwn(FAMILY_LOGOS, providerId) ? FAMILY_LOGOS[providerId] : null;
                if (logo) {
                    const img = document.createElement('img');
                    img.src = logo;
                    img.alt = '';
                    img.className = 'family-mark mr-2';
                    img.setAttribute('aria-hidden', 'true');
                    return img;
                }
                if (!Object.hasOwn(FAMILY_ICONS, providerId)) return null;
                const icon = document.createElement('i');
                icon.className = FAMILY_ICONS[providerId] + ' mr-2';
                icon.setAttribute('aria-hidden', 'true');
                return icon;
            }

            function renderRail(providers, keys) {
                rail.textContent = '';
                providers.forEach((p) => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'w-full text-left p-2 rounded border';
                    const active = p.id === selected;
                    item.style.borderColor = active ? 'var(--primary)' : 'transparent';
                    item.style.backgroundColor = active ? 'rgba(80,70,229,.08)' : '';
                    item.setAttribute('aria-pressed', String(active));
                    item.addEventListener('click', () => {
                        selected = p.id;
                        renderRail(lastHealth.providers, lastHealth.keys);
                        renderTable(lastHealth.providers, lastHealth.keys);
                    });
                    const title = document.createElement('div');
                    title.className = 'flex items-center text-sm font-medium';
                    const icon = familyIcon(p.id);
                    if (icon) title.appendChild(icon);
                    title.appendChild(document.createTextNode(p.displayName || p.id));
                    const familyKeys = keys.filter((k) => k.providerId === p.id);
                    const meta = document.createElement('div');
                    meta.className = 'text-xs opacity-60 mt-1';
                    meta.textContent = familyKeys.filter((k) => k.enabled).length + '/' + familyKeys.length + ' active';
                    item.appendChild(title);
                    item.appendChild(meta);
                    rail.appendChild(item);
                });
            }

            function keyToggle(k) {
                const toggle = document.createElement('label');
                toggle.className = 'tswitch';
                toggle.title = (k.enabled ? 'Disable ' : 'Enable ') + k.label;
                const box = document.createElement('input');
                box.type = 'checkbox';
                box.setAttribute('role', 'switch');
                box.setAttribute('aria-checked', String(k.enabled));
                box.setAttribute('aria-label', (k.enabled ? 'Disable ' : 'Enable ') + k.label);
                box.checked = k.enabled;
                box.addEventListener('change', async () => {
                    box.setAttribute('aria-checked', String(box.checked));
                    // Serialize per row: two toggles racing means the commits can
                    // land in either order, leaving the stored enabled state
                    // disagreeing with the switch that shows the user's choice.
                    // The restore below stays correct too: with one request in
                    // flight, k.enabled is still the last rendered value.
                    box.disabled = true;
                    try {
                        const res = await api('PATCH', ADMIN_KEYS + '/' + k.id, { enabled: box.checked });
                        if (res.stale) return;
                        if (!res.ok) {
                            showError(errorLine, errorMessage(res));
                            box.checked = k.enabled;
                            box.setAttribute('aria-checked', String(k.enabled));
                            return;
                        }
                        // Toggle switch provides immediate visual feedback, no notification needed
                        loadHealth();
                    } catch (error) {
                        showError(errorLine, error instanceof Error ? error.message : String(error));
                        box.checked = k.enabled;
                        box.setAttribute('aria-checked', String(k.enabled));
                    } finally {
                        box.disabled = false;
                    }
                });
                const track = document.createElement('span');
                track.className = 'track';
                const thumb = document.createElement('span');
                thumb.className = 'thumb';
                track.appendChild(thumb);
                toggle.appendChild(box);
                toggle.appendChild(track);
                return toggle;
            }

            function editButton(k) {
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.className = 'btn btn-secondary text-xs py-1 px-2';
                edit.setAttribute('aria-label', 'Edit key #' + k.id);
                edit.title = 'Edit key #' + k.id;
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-pen';
                edit.appendChild(icon);
                edit.addEventListener('click', () => openSheet('edit', k));
                return edit;
            }

            // Hard delete, distinct from the enable/disable toggle: the row and
            // its sealed versions are gone for good. A confirmation naming the
            // key is the only guard, so it must never be skipped.
            function deleteButton(k) {
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'btn btn-danger text-xs py-1 px-2';
                del.setAttribute('aria-label', 'Delete key #' + k.id);
                del.title = 'Delete key #' + k.id;
                const icon = document.createElement('i');
                icon.className = 'fa-solid fa-trash';
                del.appendChild(icon);
                del.addEventListener('click', async () => {
                    const who = k.maskedKey || k.accountId || k.label || ('#' + k.id);
                    if (!window.confirm('Delete key #' + k.id + ' (' + who + ')? This cannot be undone.')) return;
                    // Serialize per row: a second click while the first is in
                    // flight could delete a key id the refresh has already
                    // reassigned to a different row.
                    del.disabled = true;
                    try {
                        const res = await api('POST', ADMIN_KEYS + '/' + k.id + '/delete');
                        if (res.stale) return;
                        if (!res.ok) {
                            showError(errorLine, errorMessage(res));
                            return;
                        }
                        hideError(errorLine);
                        showNotice('Deleted key #' + k.id + '.');
                        loadHealth();
                    } catch (error) {
                        showError(errorLine, error instanceof Error ? error.message : String(error));
                    } finally {
                        del.disabled = false;
                    }
                });
                return del;
            }

            function renderTable(providers, keys) {
                const family = providers.find((p) => p.id === selected);
                // The account-ID column belongs to the transport, not the family:
                // an openai-compat provider has no Cloudflare account behind it.
                const hasAcct = !!family && family.transport === 'cloudflare-rest';
                // Key leads: the masked hint is how an operator tells two keys
                // apart. The account-ID column is only real for cloudflare-rest,
                // so it hides entirely for an openai-compat family instead of
                // rendering a column of dashes.
                keysHead.textContent = 'Key';
                acctHead.classList.toggle('hidden', !hasAcct);
                familyName.textContent = '';
                if (family) {
                    const icon = familyIcon(family.id);
                    if (icon) familyName.appendChild(icon);
                    familyName.appendChild(document.createTextNode(family.displayName || family.id));
                }
                const rows = keys.filter((k) => k.providerId === selected);
                keysBody.textContent = '';
                rows.forEach((k) => {
                    const tr = document.createElement('tr');
                    if (!k.enabled) tr.style.opacity = '.55';

                    const keyCell = document.createElement('td');
                    keyCell.className = 'p-3 font-mono text-sm';
                    // The hint is computed server-side: the browser never holds
                    // a token, so it cannot mask one. A key whose envelope will
                    // not open arrives without a hint, and reads as a dash
                    // rather than as an empty cell.
                    keyCell.textContent = k.maskedKey || '—';
                    if (k.activeVersion !== null && k.activeVersion !== undefined) {
                        const ver = document.createElement('span');
                        ver.className = 'opacity-60 text-xs ml-2';
                        ver.textContent = 'v' + k.activeVersion;
                        keyCell.appendChild(ver);
                    }

                    const actions = document.createElement('td');
                    actions.className = 'p-3 whitespace-nowrap text-right';
                    const wrap = document.createElement('span');
                    wrap.className = 'inline-flex gap-2 items-center';
                    wrap.appendChild(keyToggle(k));
                    wrap.appendChild(editButton(k));
                    wrap.appendChild(deleteButton(k));
                    actions.appendChild(wrap);

                    tr.appendChild(keyCell);
                    if (hasAcct) {
                        const acctCell = document.createElement('td');
                        acctCell.className = 'p-3 font-mono text-sm';
                        acctCell.textContent = k.accountId || '—';
                        tr.appendChild(acctCell);
                    }
                    tr.appendChild(actions);
                    keysBody.appendChild(tr);
                });
                emptyLine.classList.toggle('hidden', rows.length > 0);
            }

            function openSheet(mode, key) {
                // A new open replaces whatever the sheet showed, so any request
                // still in flight for the previous sheet may no longer touch it.
                sheetGeneration += 1;
                const isEdit = mode === 'edit' && !!key;
                sheetKeyId = isEdit ? key.id : null;
                sheetEyebrow.textContent = isEdit ? 'EDIT' : 'NEW';
                sheetTitle.textContent = isEdit
                    ? 'Edit Key #' + key.id + ' (' + key.providerId + (key.activeVersion !== null && key.activeVersion !== undefined ? ' · v' + key.activeVersion : '') + ')'
                    : 'New Key (' + selected + ')';
                sheetNote.textContent = isEdit
                    ? 'Leave the token blank to keep the current version. Filling it rotates as part of save.'
                    : 'The key will be sealed server-side on save.';
                sheetAcct.value = isEdit ? (key.accountId || '') : '';
                const wantsAcct = needsAccountId(selected);
                sheetAcctField.classList.toggle('hidden', !wantsAcct);
                sheetTokenHint.textContent = isEdit && key.activeVersion !== null && key.activeVersion !== undefined
                    ? (key.maskedKey ? key.maskedKey + ' · ' : '') + '(blank = keep v' + key.activeVersion + ')'
                    : '';
                sheetToken.value = '';
                sheetToken.type = 'password';
                sheetTokenEye.innerHTML = '<i class="fa-solid fa-eye"></i>';
                sheetTokenEye.setAttribute('aria-label', 'Show token');
                sheetWeight.value = isEdit ? String(key.weight) : '1';
                sheetEnabled.checked = isEdit ? !!key.enabled : true;
                sheetSave.textContent = isEdit ? 'Save' : 'Add key';
                sheetSave.disabled = false;
                hideError(sheetError);
                sheet.classList.remove('hidden');
                // Focus the first field the operator can actually fill.
                if (wantsAcct) sheetAcct.focus(); else sheetToken.focus();
            }

            function closeSheet() {
                // Dismissal (Cancel, backdrop, Escape) invalidates in-flight
                // sheet requests for the same reason openSheet does.
                sheetGeneration += 1;
                sheet.classList.add('hidden');
                sheetKeyId = null;
                sheetToken.value = '';
                hideError(sheetError);
            }

            function nextLabel() {
                // Generate timestamp-based label to avoid collisions
                // Format: key-1729123456789
                // User never sees this (labels hidden from UI)
                return 'key-' + Date.now();
            }

            sheetSave.addEventListener('click', async () => {
                const isEdit = sheetKeyId !== null;
                const accountId = sheetAcct.value.trim();
                const token = sheetToken.value.trim();
                const weightRaw = sheetWeight.value.trim();
                const weight = weightRaw === '' ? 1 : Number(weightRaw);
                if (needsAccountId(selected) && !accountId) {
                    showError(sheetError, 'Cloudflare account ID is required.');
                    sheetAcct.focus();
                    return;
                }
                if (!isEdit && !token) {
                    showError(sheetError, 'API token is required.');
                    sheetToken.focus();
                    return;
                }
                if (token && token.length < 8) {
                    showError(sheetError, isEdit
                        ? 'Token looks too short — paste the full value, or leave blank to keep.'
                        : 'Token looks too short — paste the full value.');
                    sheetToken.focus();
                    return;
                }
                // The bound is the input's own max attribute, which the workbench
                // contract test pins to the server's MAX_WEIGHT — so the UI cannot
                // drift from the API's ceiling.
                const maxWeight = Number(sheetWeight.max);
                if (!Number.isInteger(weight) || weight < 0 || weight > maxWeight) {
                    showError(sheetError, 'Weight must be an integer between 0 and ' + maxWeight + '.');
                    sheetWeight.focus();
                    return;
                }
                sheetSave.disabled = true;
                const generation = adminRequestGeneration;
                const sheetScope = sheetGeneration;
                try {
                    if (isEdit) {
                        const body = {
                            accountId: accountId,
                            weight: weight,
                            enabled: sheetEnabled.checked
                        };
                        if (token) body.apiToken = token;
                        const res = await api('PATCH', ADMIN_KEYS + '/' + sheetKeyId, body);
                        if (res.stale) return;
                        // The sheet may have been dismissed or replaced while this
                        // request was in flight; it belongs to sheetScope alone.
                        if (sheetScope !== sheetGeneration) return;
                        if (!res.ok) {
                            showError(sheetError, errorMessage(res));
                            return;
                        }
                        // Success - sheet closes, table refreshes (visual feedback sufficient)
                        closeSheet();
                        loadHealth();
                    } else {
                        const label = nextLabel();
                        const res = await api('POST', ADMIN_KEYS, {
                            providerId: selected,
                            label: label,
                            apiToken: token,
                            accountId: accountId,
                            weight: weight,
                            enabled: sheetEnabled.checked
                        });
                        if (res.stale) return;
                        if (sheetScope !== sheetGeneration) return;
                        if (!res.ok) {
                            showError(sheetError, errorMessage(res));
                            // Re-read the pool then retry with fresh label
                            // (timestamp-based labels should never collide, but refresh just in case)
                            await loadHealth();
                            if (sheetScope !== sheetGeneration) return;
                            return;
                        }
                        // Success - sheet closes, table refreshes (visual feedback sufficient)
                        closeSheet();
                        loadHealth();
                    }
                } catch (error) {
                    if (sheetScope === sheetGeneration) {
                        showError(sheetError, error instanceof Error ? error.message : String(error));
                    }
                } finally {
                    // Only the sheet's own live request may reset the button: one
                    // that outlived a lock/logout, or that belongs to a sheet since
                    // dismissed and reopened, must not re-enable the button while a
                    // newer save is still in flight. openSheet owns the state for
                    // the next open.
                    if (
                        generation === adminRequestGeneration &&
                        sheetScope === sheetGeneration
                    ) {
                        sheetSave.disabled = false;
                    }
                }
            });

            button.addEventListener('click', () => { window.location.hash = '#admin'; });
            backBtn.addEventListener('click', () => { window.location.hash = ''; });
            window.addEventListener('hashchange', syncRoute);
            window.addEventListener('popstate', syncRoute);
            unlockBtn.addEventListener('click', async () => {
                const value = keyInput.value.trim();
                if (!value) {
                    showError(errorLine, 'Enter the management key.');
                    return;
                }
                adminKey = value;
                keyInput.value = '';
                hideError(errorLine);
                gate.classList.add('hidden');
                panel.classList.remove('hidden');
                lockBtn.classList.remove('hidden');
                chipsActive.classList.remove('hidden');
                chipsFamilies.classList.remove('hidden');
                await loadHealth();
            });
            lockBtn.addEventListener('click', lock);
            keyInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') unlockBtn.click(); });
            addKeyBtn.addEventListener('click', () => openSheet('add'));
            sheetCancel.addEventListener('click', closeSheet);
            sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
            sheetTokenEye.addEventListener('click', () => {
                const show = sheetToken.type === 'password';
                sheetToken.type = show ? 'text' : 'password';
                sheetTokenEye.innerHTML = show ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
                const label = show ? 'Hide token' : 'Show token';
                sheetTokenEye.setAttribute('aria-label', label);
                sheetTokenEye.title = label;
                sheetToken.focus();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                if (!sheet.classList.contains('hidden')) closeSheet();
                else if (window.location.hash === '#admin') window.location.hash = '';
            });
            
            // Sync theme toggle between generator and admin views
            themeToggleAdmin.addEventListener('click', () => {
                document.getElementById('themeToggle').click();
            });
            
            // Sync logout between views
            logoutButtonAdmin.addEventListener('click', () => {
                document.getElementById('logoutButton').click();
            });
            
            window.addEventListener('awb-authchange', (e) => {
                const authed = !!(e.detail && e.detail.authed);
                button.classList.toggle('hidden', !authed);
                logoutButtonAdmin.classList.toggle('hidden', !authed);
                if (!authed && window.location.hash === '#admin') {
                    window.location.hash = '';
                }
            });
            
            button.classList.toggle('hidden', logoutButton.classList.contains('hidden'));
            logoutButtonAdmin.classList.toggle('hidden', logoutButton.classList.contains('hidden'));
            syncRoute();
        })();
    </script>
</body>
</html>`;
}

export function serveFrontend(options?: {
  hasCredentials?: boolean;
}): Response {
  return new Response(getFrontendHTML(options), {
    headers: {
      "Content-Type": "text/html",
      "Cache-Control": "no-cache",
    },
  });
}
