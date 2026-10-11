import { escapeHtml } from '../utils/utils.js';
import { initDialogBackdropClose } from './dialog.js';

let shieldSequence = 0;

export function pageInfoButtonHtml(label = 'Sayfa bilgisi') {
    // SVG paint-server IDs are unique resources, never application selector hooks.
    const surfaceGradient = `page-info-steel-surface-${++shieldSequence}`;
    return `<button class="page-info-button" type="button" data-page-info-open aria-label="${escapeHtml(label)}" aria-haspopup="dialog"><svg viewBox="0 0 48 56" width="44" height="51.333333" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs><linearGradient id="${surfaceGradient}" x1="0" y1="10" x2="0" y2="43" gradientUnits="userSpaceOnUse"><stop stop-color="rgb(20 16 12 / .65)"/><stop offset="1" stop-color="rgb(9 8 6 / .85)"/></linearGradient></defs>
        <path d="M24 2 L43 9 L43 30 Q42 43 24 53 Q6 43 5 30 L5 9 Z" fill="rgb(190 175 150 / .35)" stroke="rgb(240 225 195 / .65)" stroke-width="1.5"/>
        <path d="M24 6 L39 12 L39 29 Q38 40 24 48 Q10 40 9 29 L9 12 Z" fill="rgb(22 18 13 / .55)" stroke="rgb(255 238 202 / .75)" stroke-width="1.1"/>
        <path d="M24 10 L35 14 L35 28 Q34 37 24 43 Q14 37 13 28 L13 14 Z" fill="url(#${surfaceGradient})" stroke="rgb(210 190 150 / .4)" stroke-width=".7"/>
        <text x="24" y="27" dy=".35em" text-anchor="middle" fill="currentColor" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="23">i</text>
        <g fill="none" stroke-linecap="round"><path d="M7 28 L7 10.5 L24 4.2" stroke="currentColor" stroke-width=".8" opacity=".75"/><path d="M41 12 L41 29 Q40 39 31 46" stroke="currentColor" stroke-width="1" opacity=".35"/><path d="M19 48.2 Q21.5 50 24 51.1 Q26.5 50 29 48.2" stroke="currentColor" stroke-width=".8" opacity=".55"/></g>
    </svg></button>`;
}

export function pageInfoDialogHtml(title) {
    return `<dialog class="app-dialog page-info-dialog" data-page-info-dialog aria-label="${escapeHtml(title)}"><button class="app-dialog-close" type="button" aria-label="Kapat" data-page-info-close></button><div class="page-info-sheet"><header><span class="page-info-eyebrow">NASIL ÇALIŞIR?</span><h2>${escapeHtml(title)}</h2></header><div data-page-info-content></div></div></dialog>`;
}

// Text-only cards keep content escaped; tone communicates meaning alongside headings.
export function pageInfoCardsHtml(cards) {
    return cards.map(({ title, value, lines = [], tone = 'neutral' }) => `<section class="page-info-card" data-tone="${escapeHtml(tone)}"><h3>${escapeHtml(title)}</h3>${value ? `<strong>${escapeHtml(value)}</strong>` : ''}${lines.length ? `<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}</section>`).join('');
}

export function bindPageInfo(root) {
    initDialogBackdropClose();
    const dialog = root.querySelector('[data-page-info-dialog]');
    root.querySelector('[data-page-info-open]').addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-page-info-close]').addEventListener('click', () => dialog.close());
}

const INFO_SOURCE = '[data-info], [data-page-info]';
const mountedHeads = new WeakSet();
const mountedRoots = new WeakMap();
const sentenceSegmenter = new Intl.Segmenter('tr', { granularity: 'sentence' });

function infoList(node) {
    const list = document.createElement('ul');
    // Keep rich content intact, especially copyable item names and links.
    const segments = node.children.length
        ? [node.cloneNode(true)]
        : [...sentenceSegmenter.segment(node.textContent)].map(({ segment }) => segment.trim()).filter(Boolean);
    for (const segment of segments) {
        const item = document.createElement('li');
        item.append(segment);
        list.append(item);
    }
    return list;
}

function sourceCards(source) {
    const fragment = document.createDocumentFragment();
    const blocks = source.matches('p, li') || !source.children.length ? [source] : [...source.children];
    for (const block of blocks) {
        if (!block.textContent.trim()) continue;
        if (block.matches('.page-info-card')) {
            fragment.append(block.cloneNode(true));
            continue;
        }
        const card = document.createElement('section');
        card.className = 'page-info-card';
        card.dataset.tone = block.dataset.infoTone || source.dataset.infoTone || 'neutral';
        const heading = document.createElement('h3');
        heading.textContent = block.dataset.infoTitle || source.dataset.infoTitle || 'Hesaplama ve veri';
        card.append(heading);
        const copy = block.cloneNode(true);
        if (block.dataset.infoText) copy.textContent = block.dataset.infoText;
        if (copy.matches('p, span, li') || !copy.children.length) card.append(infoList(copy));
        else card.append(copy);
        fragment.append(card);
    }
    // Copies must not duplicate source IDs or inherit source-only hiding hooks.
    fragment.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    fragment.querySelectorAll(INFO_SOURCE).forEach(node => {
        node.removeAttribute('data-info');
        node.removeAttribute('data-page-info');
        node.removeAttribute('hidden');
    });
    return fragment;
}

// Navigation mounts this once for every page head, including tools outside toolPageHtml.
// Pages only provide data-info content; dialog markup, events and refresh live here.
export function initPageInfo(head) {
    if (mountedHeads.has(head)) return;
    mountedHeads.add(head);
    const root = head.closest('main') || head.parentElement;
    const previous = mountedRoots.get(root);
    const reopen = previous?.dialog.open;
    previous?.observer.disconnect();
    previous?.dialog.remove();
    const title = head.querySelector('h1')?.childNodes;
    const name = title ? [...title].filter(node => !node.matches?.('.badge')).map(node => node.textContent).join('').trim() : 'Sayfa';
    // Header subtitles belong beside the title, never in the guide's source list.
    head.querySelectorAll('.page-head-content p, :scope > p').forEach(node => {
        node.removeAttribute('data-info');
        node.removeAttribute('data-page-info');
    });
    head.querySelectorAll('[data-app-tooltip]').forEach(node => {
        const note = document.createElement('p');
        note.setAttribute('data-info', '');
        note.dataset.infoTitle = 'Bilmeniz gerekenler';
        note.textContent = node.dataset.appTooltip;
        head.append(note);
        node.removeAttribute('data-app-tooltip');
        if (node.matches('.badge')) node.remove();
    });
    head.insertAdjacentHTML('beforeend', pageInfoButtonHtml(`${name} hakkında bilgi`));
    root.insertAdjacentHTML('beforeend', pageInfoDialogHtml(`${name} rehberi`));
    const dialog = root.querySelector('[data-page-info-dialog]');
    const content = dialog.querySelector('[data-page-info-content]');
    function refresh() {
        const fragment = document.createDocumentFragment();
        for (const source of root.querySelectorAll(INFO_SOURCE)) {
            if (source.closest('[data-page-info-dialog]') || source.parentElement.closest(INFO_SOURCE)) continue;
            fragment.append(sourceCards(source));
        }
        if (!fragment.childNodes.length) fragment.append(document.createTextNode('Bu sayfa için henüz ek açıklama bulunmuyor.'));
        content.replaceChildren(fragment);
    }
    bindPageInfo(root);
    head.querySelector('[data-page-info-open]').addEventListener('click', refresh);
    const observer = new MutationObserver(records => {
        if (!head.isConnected) { observer.disconnect(); return; }
        if (dialog.open && records.some(record => !dialog.contains(record.target))) refresh();
    });
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    mountedRoots.set(root, { dialog, observer });
    if (reopen) { refresh(); dialog.showModal(); }
}
