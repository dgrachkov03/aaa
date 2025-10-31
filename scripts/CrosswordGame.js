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

    if (this.isIOS) {
      document.documentElement.classList.add('ios');
    }

    // Флаги для управления мобильной клавиатурой
    this.keepKeyboardOpen = false;
    this.isKeyboardActive = false;
    this.keyboardOpening = false;

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
    this.addTouchHandlers();
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

    // РАЗНЫЕ СТИЛИ ДЛЯ iOS И ANDROID
    if (this.isIOS) {
      // Для iOS - видимый input
      this.mobileInput.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 60px;
        height: 60px;
        opacity: 0.3;
        background: rgba(0,0,0,0.1);
        border: 2px solid rgba(0,0,0,0.3);
        border-radius: 8px;
        font-size: 16px;
        color: transparent;
        z-index: 10000;
        pointer-events: auto;
        -webkit-user-select: none;
        user-select: none;
      `;
    } else {
      // Для Android - скрытый input
      this.mobileInput.style.cssText = `
        position: fixed;
        top: -100px;
        left: -100px;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      `;
    }

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
      console.log('Keyboard focused');
    });

    this.mobileInput.addEventListener('blur', () => {
      this.isKeyboardActive = false;
      console.log('Keyboard blurred');
    });

    // Для iOS добавляем обработчик клика
    if (this.isIOS) {
      this.mobileInput.addEventListener('click', (e) => {
        e.preventDefault();
      });
    }
  }

  addTouchHandlers() {
    this.cellElements.forEach((cell) => {
      if (this.isInputCell(cell) && !this.isCorrectCell(cell)) {
        // Удаляем старые обработчики
        cell.removeEventListener('touchend', this.handleCellTouch);
        
        // Создаем новый обработчик с привязкой контекста
        this.handleCellTouch = (e) => {
          e.preventDefault();
          this.handleIOSCellClick(cell);
        };
        
        cell.addEventListener('touchend', this.handleCellTouch, { passive: false });
      }
    });
  }

  /**
   * Обработчик touch событий для мобильных устройств
   */
  handleTouchStart(e, cell) {
    if (this.isIOS) {
      // Для iOS предотвращаем стандартное поведение
      e.preventDefault();
    }
    this.handleCellClick(cell);
  }

  /**
   * Обработчик окончания касания для iOS
   */
  handleTouchEnd(e, cell) {
    if (!this.isIOS) return;
    
    // Для iOS открываем клавиатуру после окончания касания
    setTimeout(() => {
      if (this.currentCell === cell && this.keepKeyboardOpen) {
        this.forceOpenKeyboard();
      }
    }, 100);
  }

  handleKeyboardBlur() {
    if (this.keepKeyboardOpen && this.currentCell && !this.isKeyboardActive) {
      console.log('Keyboard blur detected, trying to refocus...');
      setTimeout(() => {
        if (this.keepKeyboardOpen && this.currentCell) {
          this.mobileInput.focus();
        }
      }, 100);
    }
  }

  /**
   * Специальный обработчик для iOS
   */
  handleIOSCellClick(cell) {
    if (!this.isInputCell(cell) || this.isCorrectCell(cell)) return;
    
    const wordInfo = this.findWordForCell(cell);
    if (wordInfo) {
      this.currentWordId = wordInfo.id;
      this.currentDirection = wordInfo.data.direction;
      this.slider.goToQuestion(this.currentWordId.toString());
    }
    
    this.setFocus(cell);
    this.openIOSKeyboard();
  }

  /**
   * Открытие клавиатуры для iOS
   */
  openIOSKeyboard() {
    if (!this.isIOS || !this.currentCell) return;

    this.keepKeyboardOpen = true;
    
    // На iOS фокус должен быть установлен синхронно
    setTimeout(() => {
      this.mobileInput.focus();
      
      // Дополнительные попытки
      setTimeout(() => {
        if (!this.isKeyboardActive) {
          this.mobileInput.focus();
          this.mobileInput.click();
        }
      }, 100);
    }, 10);
  }

  /**
   * Универсальное открытие клавиатуры для всех мобильных устройств
   */
  openMobileKeyboard() {
    if (!this.isMobile || !this.currentCell) return;
    
    this.keepKeyboardOpen = true;
    
    if (this.isIOS) {
      this.openIOSKeyboard();
    } else {
      // Для Android
      setTimeout(() => {
        this.mobileInput.focus();
      }, 50);
    }
  }

  /**
   * Принудительное открытие клавиатуры для iOS
   */
  forceOpenKeyboard() {
    if (!this.isMobile || !this.currentCell) return;
    
    if (this.isIOS) {
      this.mobileInput.focus();
      setTimeout(() => this.mobileInput.focus(), 50);
      setTimeout(() => this.mobileInput.focus(), 100);
    } else {
      this.mobileInput.focus();
    }
  }

  /**
   * Открытие и удержание клавиатуры в открытом состоянии
   */
  openAndKeepKeyboard() {
    if (!this.isMobile || !this.currentCell) return;
    
    this.keepKeyboardOpen = true;
    console.log('Opening and keeping keyboard open');
    
    if (this.isIOS) {
      // Для iOS используем отложенное открытие
      setTimeout(() => {
        this.forceOpenKeyboard();
      }, 100);
    } else {
      // Для других мобильных
      setTimeout(() => {
        this.mobileInput.focus();
      }, 100);
    }
  }

  /**
   * Закрытие клавиатуры
   */
  closeKeyboard() {
    if (!this.isMobile) return;
    
    console.log('Closing keyboard');
    this.keepKeyboardOpen = false;
    this.isKeyboardActive = false;
    this.mobileInput.blur();
    
    // Для iOS также убираем фокус
    if (this.isIOS) {
      this.mobileInput.style.opacity = '0.1';
      this.mobileInput.style.background = 'rgba(0,0,0,0.1)';
      this.mobileInput.style.border = '1px solid rgba(0,0,0,0.2)';
    }
  }

  /**
   * Обеспечивает постоянный фокус на input для мобильной клавиатуры
   */
  keepKeyboardFocused() {
    if (!this.isMobile || !this.keepKeyboardOpen || this.isKeyboardActive || this.keyboardOpening) return;
    
    setTimeout(() => {
      if (this.keepKeyboardOpen && !this.isKeyboardActive && this.currentCell && !this.keyboardOpening) {
        console.log('Keeping keyboard focused');
        this.forceOpenKeyboard();
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
          this.keepKeyboardFocused();
        }, 50);
      } else {
        if (this.isCurrentWordFullyFilled()) {
          const wasCorrect = this.checkCurrentWord();
          if (wasCorrect) {
            setTimeout(() => {
              this.keepKeyboardFocused();
            }, 100);
          } else {
            this.keepKeyboardFocused();
          }
        } else {
          this.keepKeyboardFocused();
        }
      }
    }
  }

  /**
   * Обработка Backspace для мобильных устройств
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
    
    this.keepKeyboardFocused();
  }

  /**
   * Ручное закрытие клавиатуры
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
   */
  loadProgress() {
    const saved = localStorage.getItem(`crossword-${this.crosswordId}-progress`);

    if (saved) {
      try {
        const progress = JSON.parse(saved);
        this.solvedWords = new Set(progress.solvedWords || []);
        
        this.restoreSolvedCells();
        this.restoreUserInput(progress.userLetters || {});
        
        if (this.isCrosswordCompleted()) {
          this.popupController.checkCrosswordCompletion(
            this.solvedWords.size, 
            Object.keys(this.data.words).length
          );
        }
        
      } catch (e) {
        console.error('Error loading progress:', e);
      }
    }
  }

  /**
   * Восстанавливает визуальное состояние решенных ячеек
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
      console.error('Error sending completion data:', error);
    }
  }

  /**
   * Подсвечивает ячейки текущего активного слова
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
   */
  handleSliderQuestionChange(wordId) {
    if (!wordId) return;
    
    this.currentWordId = wordId;
    const wordData = this.data.words[wordId];
    this.currentDirection = wordData.direction;
    
    const firstCell = this.findFirstAvailableCellInWord(wordId);
    if (firstCell) {
      this.setFocus(firstCell);
    }
    
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
      this.openMobileKeyboard();
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
   */
  handleKeyPress(e) {
    if (this.isMobile) return;

    if (!this.currentCell || this.isCorrectCell(this.currentCell)) return;

    if (e.key.length === 1 && /[а-яА-Яa-zA-Z]/.test(e.key)) {
      this.currentCell.textContent = e.key.toUpperCase();
      this.clearWrongStatusOnly(this.currentCell);
      
      this.checkAllWordsForCell(this.currentCell);
      this.saveProgress();
      
      if (this.isCurrentWordFullyFilled()) {
        this.checkCurrentWord();
      }
      
      if (!this.isEndOfWord()) {
        this.moveInCurrentDirection("forward");
      }
    }
    else if (e.key === "Backspace") {
      const hasContent = this.currentCell.textContent !== "";

      if (hasContent && !this.isCorrectCell(this.currentCell)) {
        this.currentCell.textContent = "";
        this.clearWrongStatusOnly(this.currentCell);
        this.saveProgress();
      } else {
        this.moveInCurrentDirection("backward");
      }
    }
    else if (e.key === "Delete") {
      if (!this.isCorrectCell(this.currentCell)) {
        this.currentCell.textContent = "";
        this.clearWrongStatusOnly(this.currentCell);
        this.saveProgress();
      }
    }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      this.handleArrowNavigation(e.key);
    }
    else if (e.key === "Enter") {
      e.preventDefault();
      this.checkCurrentWord();
    }
  }

  /**
   * Проверяет полностью ли заполнено текущее активное слово
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
      if (cell && !this.isCorrectCell(cell) && !cell.textContent.trim()) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Проверяет все слова, которые используют данную ячейку
   */
  checkAllWordsForCell(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    
    for (const wordId in this.data.words) {
      const wordData = this.data.words[wordId];
      const { direction, startPosition, length } = wordData;
      const { row: startRow, col: startCol } = startPosition;
      
      let belongsToWord = false;
      if (direction === "horizontal") {
        belongsToWord = (row === startRow && col >= startCol && col < startCol + length);
      } else {
        belongsToWord = (col === startCol && row >= startRow && row < startRow + length);
      }
      
      if (belongsToWord && this.solvedWords.has(wordId)) {
        this.checkWord(wordId);
      }
    }
  }

  /**
   * Проверяет находится ли текущая ячейка в конце слова
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

    const found = this.findAndFocusCell(newRow, newCol, key);
    
    if (!found) {
      this.highlightCurrentWord();
    }
  }

  /**
   * Обновляет активное слово на основе новой позиции курсора
   */
  updateWordForPosition(row, col, direction) {
    const cell = this.cells[row]?.[col];
    if (cell && this.isInputCell(cell)) {
      const wordInfo = this.findWordForCell(cell);
      
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
   */
  checkWord(wordId) {
    const wordData = this.data.words[wordId];
    if (!wordData) return false;

    const { direction, startPosition, length, word: correctWord } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    let userWord = "";
    const wordCells = [];

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

    wordCells.forEach((cell, index) => {
      if (!this.isCorrectCell(cell)) {
        this.clearWrongStatusOnly(cell);
        if (isCorrect) {
          cell.classList.add(this.stateClasses.isCorrect);
          cell.style.pointerEvents = "none";
        } else {
          cell.classList.add(this.stateClasses.isWrong);
        }
      }
    });

    if (isCorrect) {
      this.solvedWords.add(wordId);
      this.saveProgress();
      
      if (this.isCrosswordCompleted()) {
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
        
        if (this.isMobile) {
          this.keepKeyboardOpen = true;
          this.keepKeyboardFocused();
        }
      } else {
        if (this.isMobile) {
          this.keepKeyboardFocused();
        }
      }
    } else {
      if (this.isMobile) {
        this.closeKeyboard();
      }
    }
  }

  /**
   * Находит первую доступную ячейку в указанном слове
   */
  findFirstAvailableCellInWord(wordId) {
    const wordData = this.data.words[wordId];
    if (!wordData) return null;

    const { direction, startPosition, length } = wordData;
    const { row: startRow, col: startCol } = startPosition;

    for (let i = 0; i < length; i++) {
      const row = direction === "horizontal" ? startRow : startRow + i;
      const col = direction === "horizontal" ? startCol + i : startCol;
      
      const cell = this.cells[row]?.[col];
      if (cell && this.isInputCell(cell)) {
        if (!this.isCorrectCell(cell)) {
          return cell;
        }
        if (i === 0) {
          return cell;
        }
      }
    }
    
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
   */
  findWordForCell(cell) {
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    if (this.currentWordId && this.isCellInCurrentWord(cell)) {
      const currentWordData = this.data.words[this.currentWordId];
      return { id: this.currentWordId, data: currentWordData };
    }

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
        this.updateWordForPosition(row, col, direction);
        this.setFocus(cell);
        
        if (this.isMobile) {
          this.openAndKeepKeyboard();
        }
        
        return true;
      }

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