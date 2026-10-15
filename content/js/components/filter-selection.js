/** Repeating a selected filter clears it to the group's all value. */
export function toggleAllFilter(current, selected, all = 'all') {
    return String(current) === String(selected) ? all : selected;
}

export { readChoiceSelection, writeChoiceSelection, changeChoiceSelection, choiceMatches, choiceState, validChoiceSelection } from '../core/choice-selection.mjs';
import { changeChoiceSelection, writeChoiceSelection, choiceState } from '../core/choice-selection.mjs';
export function chooseFilter(current, selected, event, all = 'all') {
    return writeChoiceSelection(changeChoiceSelection(current, selected, event, all), all);
}
export function updateChoiceButtons(buttons, selection, valueOf, all = 'all') {
    for (const button of buttons) {
        const state = choiceState(selection, valueOf(button), all);
        button.classList.toggle('is-active', state.active);
        button.classList.toggle('is-excluded', state.excluded);
        button.setAttribute('aria-pressed', String(state.active));
        button.setAttribute('aria-label', `${button.dataset.choiceLabel || button.textContent.trim()}${state.excluded ? ' (hariç tutuldu)' : ''}`);
    }
}
