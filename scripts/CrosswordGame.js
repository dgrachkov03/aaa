import { CROSSWORDS_DATA } from "./data.js";
import CrosswordSlider from "./CrosswordSlider.js";
import PopupController from "./PopupController.js";

/**
 * Основной класс для управления игрой в кроссворд
 * Отвечает за логику игры, обработку ввода, сохранение состояния и взаимодействие с UI
 */
class CrosswordGame {
  // Селекторы DOM элементов
  selectors = {
    root: '[data-component="crossword"]',
    grid: "[data-crossword-grid]",
    cell: ".crossword__cell",
    number: ".crossword__number",
  };

  // CSS классы для управления состоянием ячеек
  stateClasses = {
    isFocused: "is-focused",
    isWrong: "is-wrong",
    isCorrect: "is-correct",
    empty: "crossword__cell--empty",
    isActive: "is-active",
  };

  /**
   * Конструктор инициализирует игру с указанным кроссвордом
   */
  constructor(container, crosswordId = 1) {
    this.rootElement = container;
    this.gridElement = this.rootElement.querySelector(this.selectors.grid);
    this.cellElements = this.gridElement.querySelectorAll(this.selectors.cell);

    this.crosswordId = crosswordId;
    this.data = CROSSWORDS_DATA[crosswordId];

    // Текущее состояние игры
    this.currentWordId = null;
    this.currentDirection = "horizontal";
    this.currentCell = null;
    this.cells = {};

    // Прогресс пользователя
    this.solvedWords = new Set();
    this.startTime = Date.now();

    // Определяем мобильное устройство
    this.isMobile = this.detectMobileDevice();
    this.isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    this.isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    // Флаги для управления мобильной клавиатурой
    this.keepKeyboardOpen = false;
    this.isKeyboardActive = false;

    this.keyboardRetryCount = 0;
    this.maxKeyboardRetries = 3;

    this.createGridMapping();
    
    // Инициализация слайдера вопросов
    this.slider = new CrosswordSlider(this.data, (wordId) => {
      this.handleSliderQuestionChange(wordId);
    });

    this.popupController = new PopupController();

    this.loadProgress();
    this.init();
    this.setupMobileInput();
  }

  detectMobileDevice() {
    const userAgent = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Для iPad с macOS нужно дополнительно проверять
    const isiPad = /Macintosh/.test(userAgent) && hasTouch;
    
    return isMobile || hasTouch || isiPad;
  }

  /**
   * Настройка скрытого input для мобильной клавиатуры
   * Создает скрытое поле ввода для управления мобильной клавиатурой
   */
  setupMobileInput() {
    const oldInput = document.getElementById('mobile-keyboard-input');
    if (oldInput) oldInput.remove();

    this.mobileInput = document.createElement('input');
    this.mobileInput.id = 'mobile-keyboard-input';
    this.mobileInput.type = 'text';
    
    this.mobileInput.setAttribute('inputmode', 'text');
    this.mobileInput.setAttribute('autocomplete', 'off');
    this.mobileInput.setAttribute('autocorrect', 'off');
    this.mobileInput.setAttribute('autocapitalize', 'characters');
    this.mobileInput.setAttribute('spellcheck', 'false');
    this.mobileInput.setAttribute('aria-hidden', 'true');

    this.mobileInput.style.cssText = `
      position: fixed;
      bottom: 5px;
      right: 5px;
      width: 10px;
      height: 10px;
      opacity: 0.5;
      background: rgba(0,0,0,0.1);
      border: 1px solid rgba(0,0,0,0.2);
      border-radius: 2px;
      font-size: 8px;
      color: transparent;
      z-index: 10000;
      pointer-events: auto;
      -webkit-user-select: none;
      user-select: none;
    `;

    document.body.appendChild(this.mobileInput);

    this.mobileInput.addEventListener('input', (e) => {
      if (this.currentCell && e.target.value) {
        this.handleMobileInput(e.target.value);
        e.target.value = '';
      }
    });

    this.mobileInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.checkCurrentWord();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        this.handleMobileBackspace();
      }
    });

    this.mobileInput.addEventListener('focus', () => {
      this.isKeyboardActive = true;
      setTimeout(() => {
        this.mobileInput.style.opacity = '0.1';
        this.mobileInput.style.background = 'transparent';
        this.mobileInput.style.border = 'none';
      }, 100);
    });

    this.mobileInput.addEventListener('blur', () => {
      this.isKeyboardActive = false;
      this.mobileInput.style.opacity = '0.5';
      this.mobileInput.style.background = 'rgba(0,0,0,0.1)';
      this.mobileInput.style.border = '1px solid rgba(0,0,0,0.2)';
      
      this.handleKeyboardBlur();
    });

    this.addTouchHandlers();
  }

  addTouchHandlers() {
    this.cellElements.forEach((cell) => {
      if (this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        cell.addEventListener('touchstart', (e) => {
          this.handleTouchStart(e, cell);
        }, { passive: true });
      }
    });
  }

  /**
   * Обработчик touch событий для мобильных устройств
   */
  handleTouchStart(e, cell) {
    e.preventDefault();
    this.handleCellClick(cell);
  }

  handleKeyboardBlur() {
    if (this.keepKeyboardOpen && this.currentCell && !this.isKeyboardActive) {
      setTimeout(() => {
        if (this.keepKeyboardOpen && this.currentCell) {
          this.mobileInput.focus();
        }
      }, 150);
    }
  }

  /**
   * Открытие и удержание клавиатуры в открытом состоянии
   * Устанавливает флаг keepKeyboardOpen и фокусируется на скрытом input
   */
  openAndKeepKeyboard() {
    if (!this.isMobile || !this.currentCell) return;
    
    this.keepKeyboardOpen = true;
    
    if (this.isIOS) {
      setTimeout(() => {
        this.mobileInput.focus();
      }, 100);
      
      setTimeout(() => {
        if (!this.isKeyboardActive) {
          this.mobileInput.focus();
          this.mobileInput.click();
        }
      }, 300);
    } else {
      this.mobileInput.focus();
    }
  }

  /**
   * Закрытие клавиатуры
   * Сбрасывает флаги и убирает фокус со скрытого input
   */
  closeKeyboard() {
    if (!this.isMobile) return;
    
    this.keepKeyboardOpen = false;
    this.isKeyboardActive = false;
    this.mobileInput.blur();
  }

  /**
   * Обеспечивает постоянный фокус на input для мобильной клавиатуры
   * Автоматически возвращает фокус если клавиатура должна оставаться открытой
   */
  keepKeyboardFocused() {
    if (!this.isMobile || !this.keepKeyboardOpen || this.isKeyboardActive) return;
    
    setTimeout(() => {
      if (this.keepKeyboardOpen && !this.isKeyboardActive && this.currentCell) {
        this.mobileInput.focus({ preventScroll: true });
      }
    }, 100);
  }

  /**
   * Обработка ввода с мобильной клавиатуры
   */
  handleMobileInput(char) {
    if (!this.currentCell || this.isCorrectCell(this.currentCell)) return;
    
    if (/[а-яА-Яa-zA-Z]/.test(char)) {
      this.currentCell.textContent = char.toUpperCase();
      this.clearWrongStatusOnly(this.currentCell);
      
      this.checkAllWordsForCell(this.currentCell);
      this.saveProgress();
      
      // Автопереход на следующую ячейку
      if (!this.isEndOfWord()) {
        setTimeout(() => {
          this.moveInCurrentDirection("forward");
          // После перехода сохраняем фокус на input
          this.keepKeyboardFocused();
        }, 50);
      } else {
        // Если достигли конца слова, проверяем его
        if (this.isCurrentWordFullyFilled()) {
          const wasCorrect = this.checkCurrentWord();
          if (wasCorrect) {
            // Слово правильно - НЕ закрываем клавиатуру, она останется открытой для следующего слова
            setTimeout(() => {
              this.keepKeyboardFocused();
            }, 100);
          } else {
            // Если слово неправильное, оставляем клавиатуру открытой для исправлений
            this.keepKeyboardFocused();
          }
        } else {
          // Слово не полностью заполнено - оставляем клавиатуру открытой
          this.keepKeyboardFocused();
        }
      }
    }
  }

  /**
   * Обработка Backspace для мобильных устройств
   * Специальная версия для мобильного ввода с сохранением фокуса клавиатуры
   */
  handleMobileBackspace() {
    if (!this.currentCell) return;
    
    const hasContent = this.currentCell.textContent !== "";
    
    if (hasContent && !this.isCorrectCell(this.currentCell)) {
      this.currentCell.textContent = "";
      this.clearWrongStatusOnly(this.currentCell);
      this.saveProgress();
    } else {
      this.moveInCurrentDirection("backward");
    }
    
    // Сохраняем фокус после Backspace
    this.keepKeyboardFocused();
  }

  /**
   * Ручное закрытие клавиатуры по требованию пользователя
   * Может использоваться для кнопки "Скрыть клавиатуру"
   */
  manualCloseKeyboard() {
    if (this.isMobile) {
      this.closeKeyboard();
    }
  }

  init() {
    this.bindEvents();
  }

  /**
   * Создает двумерную карту ячеек для быстрого доступа по координатам [row][col]
   */
  createGridMapping() {
    this.cellElements.forEach((cell) => {
      const row = parseInt(cell.dataset.row);
      const col = parseInt(cell.dataset.col);

      if (isNaN(row) || isNaN(col)) return;

      if (!this.cells[row]) this.cells[row] = {};
      this.cells[row][col] = cell;
    });
  }

  /**
   * Загружает сохраненный прогресс из localStorage
   * Восстанавливает решенные слова и введенные пользователем буквы
   */
  loadProgress() {
    const saved = localStorage.getItem(`crossword-${this.crosswordId}-progress`);

    if (saved) {
      try {
        const progress = JSON.parse(saved);
        this.solvedWords = new Set(progress.solvedWords || []);
        
        // Восстанавливаем решенные слова и введенные буквы
        this.restoreSolvedCells();
        this.restoreUserInput(progress.userLetters || {});
        
        // Проверяем завершение после загрузки прогресса
        if (this.isCrosswordCompleted()) {
          this.popupController.checkCrosswordCompletion(
            this.solvedWords.size, 
            Object.keys(this.data.words).length
          );
        }
        
      } catch (e) {
        // Ошибка загрузки прогресса
      }
    }
  }

  /**
   * Восстанавливает визуальное состояние решенных ячеек
   * Отображает правильные буквы и блокирует взаимодействие
   */
  restoreSolvedCells() {
    this.solvedWords.forEach(wordId => {
      const wordData = this.data.words[wordId];
      if (!wordData) return;

      const { direction, startPosition, length, word: correctWord } = wordData;
      const { row: startRow, col: startCol } = startPosition;

      for (let i = 0; i < length; i++) {
        const row = direction === "horizontal" ? startRow : startRow + i;
        const col = direction === "horizontal" ? startCol + i : startCol;
        
        const cell = this.cells[row]?.[col];
        if (cell) {
          cell.textContent = correctWord[i];
          cell.classList.add(this.stateClasses.isCorrect);
          cell.style.pointerEvents = "none";
        }
      }
    });
  }

  /**
   * Восстанавливает все введенные пользователем буквы из сохраненного прогресса
   */
  restoreUserInput(userLetters) {
    Object.entries(userLetters).forEach(([key, letter]) => {
      const [row, col] = key.split('-').map(Number);
      const cell = this.cells[row]?.[col];
      
      if (cell && this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        cell.textContent = letter;
        this.clearWrongStatusOnly(cell);
      }
    });
  }

  /**
   * Собирает все введенные пользователем буквы для сохранения
   * Игнорирует решенные ячейки (они сохраняются отдельно)
   */
  saveAllLetters() {
    const letters = {};
    
    this.cellElements.forEach(cell => {
      if (this.isInputCell(cell) && cell.textContent && !this.isCorrectCell(cell)) {
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        letters[`${row}-${col}`] = cell.textContent;
      }
    });
    
    return letters;
  }

  /**
   * Сохраняет полный прогресс в localStorage
   * Включает решенные слова и все введенные буквы
   */
  saveProgress() {
    const progress = {
      solvedWords: Array.from(this.solvedWords),
      userLetters: this.saveAllLetters(),
      timestamp: Date.now(),
      crosswordId: this.crosswordId
    };
    
    localStorage.setItem(`crossword-${this.crosswordId}-progress`, JSON.stringify(progress));
  }

  /**
   * Отправляет данные о завершении кроссворда на бэкенд
   */
  async sendCompletionToBackend() {
    const completionData = {
      crosswordId: this.crosswordId,
      completed: true,
      timeSpent: Date.now() - this.startTime,
      completedAt: new Date().toISOString(),
      solvedWordsCount: this.solvedWords.size,
      totalWords: Object.keys(this.data.words).length
    };

    try {
      console.log('Completion data:', completionData);
    } catch (error) {
      // Игнорируем ошибки отправки
    }
  }

  /**
   * Подсвечивает ячейки текущего активного слова
   * Помогает пользователю визуально ориентироваться в текущем слове
   */
  highlightCurrentWord() {
    this.cellElements.forEach(cell => {
      cell.classList.remove(this.stateClasses.isActive);
    });
    
    if (this.currentWordId) {
      const wordData = this.data.words[this.currentWordId];
      const { direction, startPosition, length } = wordData;
      const { row: startRow, col: startCol } = startPosition;
      
      for (let i = 0; i < length; i++) {
        const row = direction === "horizontal" ? startRow : startRow + i;
        const col = direction === "horizontal" ? startCol + i : startCol;
        
        const cell = this.cells[row]?.[col];
        if (cell && !cell.classList.contains(this.stateClasses.empty)) {
          cell.classList.add(this.stateClasses.isActive);
        }
      }
    }
  }

  /**
   * Обрабатывает смену вопроса через слайдер
   * Обновляет текущее слово и устанавливает фокус на первую доступную ячейку
   */
  handleSliderQuestionChange(wordId) {
    if (!wordId) return;
    
    this.currentWordId = wordId;
    const wordData = this.data.words[wordId];
    this.currentDirection = wordData.direction;
    
    // Находим первую доступную ячейку для этого слова
    const firstCell = this.findFirstAvailableCellInWord(wordId);
    if (firstCell) {
      this.setFocus(firstCell);
    }
    
    // Сохраняем состояние при смене вопроса через слайдер
    this.saveProgress();
  }

  /**
   * Обработка клика по ячейке кроссворда
   */
  handleCellClick(cell) {
    if (!this.isInputCell(cell) || this.isCorrectCell(cell)) return;
    
    const wordInfo = this.findWordForCell(cell);
    if (wordInfo) {
      this.currentWordId = wordInfo.id;
      this.currentDirection = wordInfo.data.direction;
      this.slider.goToQuestion(this.currentWordId.toString());
    }
    
    this.setFocus(cell);
    
    if (this.isMobile) {
      this.openAndKeepKeyboard();
    }
  }
  
  /**
  * Устанавливает фокус на указанную ячейку
  */
  setFocus(cell) {
    if (this.currentCell === cell) return false;
    
    this.clearFocus();
    
    if (cell && this.isInputCell(cell)) {
      cell.classList.add(this.stateClasses.isFocused);
      
      if (!this.isMobile) {
        cell.focus();
      }
      
      this.currentCell = cell;
      this.highlightCurrentWord();
      
      return true;
    }
    
    return false;
  }

  /**
   * Главный обработчик клавиатурных событий (только для десктопа)
   * Управляет вводом букв, навигацией и проверкой слов
   */
  handleKeyPress(e) {
    // На мобильных используем скрытый input, поэтому игнорируем прямые keydown
    if (this.isMobile) return;

    if (!this.currentCell || this.isCorrectCell(this.currentCell)) return;

    // Ввод буквы (русский и английский алфавит) - ТОЛЬКО ДЛЯ ДЕСКТОПА
    if (e.key.length === 1 && /[а-яА-Яa-zA-Z]/.test(e.key)) {
      this.currentCell.textContent = e.key.toUpperCase();
      this.clearWrongStatusOnly(this.currentCell);
      
      // Проверяем все слова, которые используют эту ячейку
      this.checkAllWordsForCell(this.currentCell);
      
      // Сохраняем только после ввода буквы
      this.saveProgress();
      
      // Проверяем слово только если оно полностью заполнено
      if (this.isCurrentWordFullyFilled()) {
        this.checkCurrentWord();
      }
      
      // Переходим вперед, если не достигнут конец слова
      if (!this.isEndOfWord()) {
        this.moveInCurrentDirection("forward");
      }
    }

    // Удаление буквы с переходом назад
    else if (e.key === "Backspace") {
      const hasContent = this.currentCell.textContent !== "";

      if (hasContent && !this.isCorrectCell(this.currentCell)) {
        this.currentCell.textContent = "";
        this.clearWrongStatusOnly(this.currentCell);
        this.saveProgress(); // Сохраняем при удалении
      } else {
        this.moveInCurrentDirection("backward");
      }
    }

    // Удаление буквы на месте (без перехода)
    else if (e.key === "Delete") {
      if (!this.isCorrectCell(this.currentCell)) {
        this.currentCell.textContent = "";
        this.clearWrongStatusOnly(this.currentCell);
        this.saveProgress();
      }
    }

    // Навигация стрелками
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      this.handleArrowNavigation(e.key);
    }

    // ПРОВЕРКА СЛОВА только по Enter
    else if (e.key === "Enter") {
      e.preventDefault();
      this.checkCurrentWord();
    }
  }

  /**
   * Проверяет полностью ли заполнено текущее активное слово
   * Используется для автоматической проверки при вводе
   */
  isCurrentWordFullyFilled() {
    if (!this.currentWordId) return false;
    
    const wordData = this.data.words[this.currentWordId];
    if (!wordData) return false;

    const { direction, startPosition, length } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    for (let i = 0; i < length; i++) {
      const row = direction === "horizontal" ? startRow : startRow + i;
      const col = direction === "horizontal" ? startCol + i : startCol;
      
      const cell = this.cells[row]?.[col];
      // Если ячейка не решена и пустая - слово не полностью заполнено
      if (cell && !this.isCorrectCell(cell) && !cell.textContent.trim()) {
        return false;
      }
    }
    
    return true; // Все ячейки заполнены
  }

  /**
   * Проверяет все слова, которые используют данную ячейку
   * Нужно для перепроверки пересекающихся слов при изменении буквы
   */
  checkAllWordsForCell(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    for (const wordId in this.data.words) {
      const wordData = this.data.words[wordId];
      const { direction, startPosition, length } = wordData;
      const { row: startRow, col: startCol } = startPosition;
      
      // Проверяем, принадлежит ли ячейка этому слову
      let belongsToWord = false;
      if (direction === "horizontal") {
        belongsToWord = (row === startRow && col >= startCol && col < startCol + length);
      } else {
        belongsToWord = (col === startCol && row >= startRow && row < startRow + length);
      }
      
      // Если ячейка принадлежит слову и слово уже решено, перепроверяем его
      if (belongsToWord && this.solvedWords.has(wordId)) {
        this.checkWord(wordId);
      }
    }
  }

  /**
   * Проверяет находится ли текущая ячейка в конце слова
   * Используется для управления автопереходом при вводе
   */
  isEndOfWord() {
    if (!this.currentCell) return false;

    const currentRow = parseInt(this.currentCell.dataset.row);
    const currentCol = parseInt(this.currentCell.dataset.col);

    const wordInfo = this.findWordForCell(this.currentCell);
    if (!wordInfo) return false;

    const { direction, startPosition, length } = wordInfo.data;
    const { row: startRow, col: startCol } = startPosition;

    if (direction === "horizontal") {
      return currentCol === startCol + length - 1;
    } else {
      return currentRow === startRow + length - 1;
    }
  }

  /**
   * Обработчик навигации стрелками
   * Меняет направление ввода в зависимости от нажатой стрелки
   */
  handleArrowNavigation(key) {
    const currentRow = parseInt(this.currentCell.dataset.row);
    const currentCol = parseInt(this.currentCell.dataset.col);

    let newRow = currentRow;
    let newCol = currentCol;

    switch (key) {
      case "ArrowLeft":
        newCol--;
        this.currentDirection = "horizontal";
        break;
      case "ArrowRight":
        newCol++;
        this.currentDirection = "horizontal";
        break;
      case "ArrowUp":
        newRow--;
        this.currentDirection = "vertical";
        break;
      case "ArrowDown":
        newRow++;
        this.currentDirection = "vertical";
        break;
    }

    // Пытаемся найти и сфокусировать ячейку
    const found = this.findAndFocusCell(newRow, newCol, key);
    
    // Если не нашли подходящую ячейку, остаемся на текущей
    if (!found) {
      this.highlightCurrentWord(); // Обновляем подсветку
    }
  }

  /**
   * Обновляет активное слово на основе новой позиции курсора
   */
  updateWordForPosition(row, col, direction) {
    const cell = this.cells[row]?.[col];
    if (cell && this.isInputCell(cell)) {
      const wordInfo = this.findWordForCell(cell);
      
      // Всегда переключаем слово при навигации стрелками, если нашли новое слово
      if (wordInfo && wordInfo.id !== this.currentWordId) {
        this.currentWordId = wordInfo.id;
        this.currentDirection = wordInfo.data.direction;
        this.slider.goToQuestion(this.currentWordId.toString());
      }
    }
  }

  /**
   * Движение в текущем направлении (вперед/назад)
   */
  moveInCurrentDirection(directionType) {
    if (!this.currentCell) return false;

    const currentRow = parseInt(this.currentCell.dataset.row);
    const currentCol = parseInt(this.currentCell.dataset.col);

    const nextCell = this.findNextAvailableCell(currentRow, currentCol, directionType);
    if (nextCell) {
      this.setFocus(nextCell);
      this.updateQuestionForCurrentCell();
      
      return true;
    }

    return false;
  }

  /**
   * Обновляет активный вопрос в слайдере на основе текущей ячейки
   */
  updateQuestionForCurrentCell() {
    if (!this.currentCell) return;
    
    const wordInfo = this.findWordForCell(this.currentCell);
    if (wordInfo && this.slider) {
      this.currentWordId = wordInfo.id;
      this.currentDirection = wordInfo.data.direction;
      this.slider.goToQuestion(this.currentWordId.toString());
      this.saveProgress();
    }
  }

  /**
   * Ищет следующую доступную ячейку в текущем направлении
   * Пропускает решенные ячейки и пустые клетки
   */
  findNextAvailableCell(startRow, startCol, directionType) {
    let row = startRow;
    let col = startCol;
    const maxSteps = 10;

    for (let step = 0; step < maxSteps; step++) {
      if (this.currentDirection === "horizontal") {
        if (directionType === "forward") {
          col++;
        } else {
          col--;
        }
      } else {
        if (directionType === "forward") {
          row++;
        } else {
          row--;
        }
      }

      if (!this.isWithinGrid(row, col)) {
        return null;
      }

      const cell = this.cells[row]?.[col];
      
      if (cell && this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        return cell;
      }
      
      if (cell && this.isCorrectCell(cell)) {
        continue;
      }
      
      break;
    }

    return null;
  }

  /**
   * Проверяет текущее активное слово
   * Возвращает true если слово было правильным
   */
  checkCurrentWord() {
    if (!this.currentCell) return false;

    const wordInfo = this.findWordForCell(this.currentCell);
    if (wordInfo) {
      const wasCorrect = this.checkWord(wordInfo.id);
      
      if (wasCorrect) {
        this.moveToNextQuestion();
        return true;
      }
    }
    return false;
  }

  /**
   * Проверяет правильность заполнения слова
   * Закрытие клавиатуры только при полном завершении кроссворда
   */
  checkWord(wordId) {
    const wordData = this.data.words[wordId];
    if (!wordData) return false;

    const { direction, startPosition, length, word: correctWord } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    let userWord = "";
    const wordCells = [];

    // Собираем введенное слово из ячеек
    for (let i = 0; i < length; i++) {
      const row = direction === "horizontal" ? startRow : startRow + i;
      const col = direction === "horizontal" ? startCol + i : startCol;
      
      const cell = this.cells[row]?.[col];
      if (cell) {
        userWord += cell.textContent || "";
        wordCells.push(cell);
      }
    }

    const isCorrect = userWord === correctWord;

    // Обновляем визуальное состояние каждой ячейки слова
    wordCells.forEach((cell, index) => {
      if (!this.isCorrectCell(cell)) {
        this.clearWrongStatusOnly(cell);
        if (isCorrect) {
          cell.classList.add(this.stateClasses.isCorrect);
          cell.style.pointerEvents = "none"; // Блокируем решенные ячейки
        } else {
          cell.classList.add(this.stateClasses.isWrong);
        }
      }
    });

    if (isCorrect) {
      this.solvedWords.add(wordId);
      this.saveProgress();
      
      // Проверяем завершение кроссворда
      if (this.isCrosswordCompleted()) {
        // Только при полном завершении кроссворда закрываем клавиатуру
        if (this.isMobile) {
          setTimeout(() => {
            this.closeKeyboard();
          }, 1000);
        }
        this.sendCompletionToBackend();
        this.popupController.checkCrosswordCompletion(
          this.solvedWords.size, 
          Object.keys(this.data.words).length
        );
      }
    }

    return isCorrect;
  }

  /**
   * Проверяет полностью ли завершен кроссворд
   */
  isCrosswordCompleted() {
    return this.solvedWords.size === Object.keys(this.data.words).length;
  }

  /**
   * Переходит к следующему нерешенному вопросу
   * Сохраняет клавиатуру открытой при переходе к следующему слову
   */
  moveToNextQuestion() {
    const nextWordId = this.findNextUncompletedWord();
    
    if (nextWordId) {
      const nextWordData = this.data.words[nextWordId];
      const { direction } = nextWordData;
      
      const firstAvailableCell = this.findFirstAvailableCellInWord(nextWordId);
      if (firstAvailableCell) {
        this.currentWordId = nextWordId;
        this.currentDirection = direction;
        this.setFocus(firstAvailableCell);
        this.slider.goToQuestion(nextWordId.toString());
        
        // На мобильных продолжаем держать клавиатуру открытой для следующего слова
        if (this.isMobile) {
          this.keepKeyboardOpen = true;
          this.keepKeyboardFocused();
        }
      } else {
        // Если не нашли доступную ячейку, оставляем клавиатуру открытой на текущей ячейке
        if (this.isMobile) {
          this.keepKeyboardFocused();
        }
      }
    } else {
      // Если не осталось нерешенных слов, закрываем клавиатуру
      if (this.isMobile) {
        this.closeKeyboard();
      }
    }
  }

  /**
   * Находит первую доступную ячейку в указанном слове
   * Отдает приоритет нерешенным ячейкам, но показывает начало слова даже если оно решено
   */
  findFirstAvailableCellInWord(wordId) {
    const wordData = this.data.words[wordId];
    if (!wordData) return null;

    const { direction, startPosition, length } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    // Ищем самую ПЕРВУЮ ячейку слова, даже если она решена
    // Но если она решена, ищем следующую нерешенную
    for (let i = 0; i < length; i++) {
      const row = direction === "horizontal" ? startRow : startRow + i;
      const col = direction === "horizontal" ? startCol + i : startCol;
      
      const cell = this.cells[row]?.[col];
      if (cell && this.isInputCell(cell)) {
        // Если ячейка не решена - возвращаем ее
        if (!this.isCorrectCell(cell)) {
          return cell;
        }
        // Если ячейка решена, но это ПЕРВАЯ ячейка слова - все равно возвращаем ее
        // чтобы пользователь видел начало слова
        if (i === 0) {
          return cell;
        }
      }
    }
    
    // Если ничего не нашли, возвращаем первую ячейку слова
    const firstRow = direction === "horizontal" ? startRow : startRow;
    const firstCol = direction === "horizontal" ? startCol : startCol;
    const firstCell = this.cells[firstRow]?.[firstCol];
    
    return firstCell && this.isInputCell(firstCell) ? firstCell : null;
  }

  /**
   * Находит следующее нерешенное слово для автоматического перехода
   */
  findNextUncompletedWord() {
    const wordIds = Object.keys(this.data.words).map(Number).sort((a, b) => a - b);
    
    for (const wordId of wordIds) {
      if (wordId.toString() === this.currentWordId) {
        continue;
      }
      
      if (!this.isWordCompleted(wordId.toString())) {
        return wordId.toString();
      }
    }
    
    return null;
  }

  /**
   * Проверяет завершено ли указанное слово
   */
  isWordCompleted(wordId) {
    const wordData = this.data.words[wordId];
    if (!wordData) return true;

    const { direction, startPosition, length } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    for (let i = 0; i < length; i++) {
      const row = direction === "horizontal" ? startRow : startRow + i;
      const col = direction === "horizontal" ? startCol + i : startCol;
      
      const cell = this.cells[row]?.[col];
      if (cell && !this.isCorrectCell(cell)) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Находит слово, к которому принадлежит указанная ячейка
   * Приоритет отдается текущему активному слову
   */
  findWordForCell(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    // Сначала проверяем, принадлежит ли ячейка текущему слову
    if (this.currentWordId && this.isCellInCurrentWord(cell)) {
      const currentWordData = this.data.words[this.currentWordId];
      return { id: this.currentWordId, data: currentWordData };
    }

    // Если не в текущем слове, ищем во всех словах
    for (const wordId in this.data.words) {
      const wordData = this.data.words[wordId];
      const { direction, startPosition, length } = wordData;
      const { row: startRow, col: startCol } = startPosition;

      if (direction === "horizontal") {
        if (row === startRow && col >= startCol && col < startCol + length) {
          return { id: wordId, data: wordData };
        }
      } else {
        if (col === startCol && row >= startRow && row < startRow + length) {
          return { id: wordId, data: wordData };
        }
      }
    }

    return null;
  }

  /**
   * Поиск и фокусировка на ячейке при навигации стрелками
   */
  findAndFocusCell(startRow, startCol, direction) {
    let row = startRow;
    let col = startCol;
    let attempts = 0;
    const maxAttempts = 20;

    while (this.isWithinGrid(row, col) && attempts < maxAttempts) {
      attempts++;
      const cell = this.cells[row]?.[col];
      
      if (cell && this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        // Всегда обновляем слово при нахождении ячейки
        this.updateWordForPosition(row, col, direction);
        this.setFocus(cell);
        
        if (this.isMobile) {
          this.openAndKeepKeyboard();
        }
        
        return true;
      }

      // Продолжаем движение в том же направлении
      switch (direction) {
        case "ArrowLeft":
          col--;
          break;
        case "ArrowRight":
          col++;
          break;
        case "ArrowUp":
          row--;
          break;
        case "ArrowDown":
          row++;
          break;
      }
    }
    
    return false;
  }

  /**
   * Проверяет находится ли ячейка в текущем активном слове
   */
  isCellInCurrentWord(cell) {
    if (!this.currentWordId) return false;
    
    const wordData = this.data.words[this.currentWordId];
    if (!wordData) return false;

    const { direction, startPosition, length } = wordData;
    const { row: startRow, col: startCol } = startPosition;
    
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    if (direction === "horizontal") {
      return (row === startRow && col >= startCol && col < startCol + length);
    } else {
      return (col === startCol && row >= startRow && row < startRow + length);
    }
  }

  // Вспомогательные методы для проверки состояний ячеек

  isCorrectCell(cell) {
    return cell.classList.contains(this.stateClasses.isCorrect);
  }

  clearCellStatus(cell) {
    cell.classList.remove(this.stateClasses.isWrong, this.stateClasses.isCorrect);
  }

  /**
   * Очищает только статус ошибки, не затрагивая правильные ячейки
   */
  clearWrongStatusOnly(cell) {
    if (!this.isCorrectCell(cell)) {
      cell.classList.remove(this.stateClasses.isWrong);
    }
  }

  /**
   * Проверяет является ли ячейка доступной для ввода
   * Исключает пустые клетки и ячейки с номерами
   */
  isInputCell(cell) {
    return (
      cell &&
      !cell.classList.contains(this.stateClasses.empty) &&
      !cell.querySelector(this.selectors.number)
    );
  }

  /**
   * Проверяет находятся ли координаты в пределах сетки кроссворда
   */
  isWithinGrid(row, col) {
    return (
      row >= 0 &&
      row < this.data.gridSize.rows &&
      col >= 0 &&
      col < this.data.gridSize.cols
    );
  }

  /**
   * Снимает фокус с текущей ячейки
   */
  clearFocus() {
    if (this.currentCell) {
      this.currentCell.classList.remove(this.stateClasses.isFocused);
    }
  }

  /**
   * Привязывает обработчики событий к ячейкам и документа
   */
  bindEvents() {
    this.cellElements.forEach((cell) => {
      if (this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        cell.addEventListener("click", () => this.handleCellClick(cell));
        cell.setAttribute("tabindex", "0");
      }
    });

    document.addEventListener("keydown", (e) => this.handleKeyPress(e));
  }
}

export default CrosswordGame;