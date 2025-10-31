import CrosswordGame from "./CrosswordGame.js";

const crosswordContainer = document.querySelector('[data-component="crossword"]');
const crosswordId = crosswordContainer.dataset.crosswordId;

new CrosswordGame(crosswordContainer, parseInt(crosswordId));