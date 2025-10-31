class PopupController {
  selectors = {
    popup: "[data-popup]",
    popupOverlay: "[data-popup-close]",
    popupClose: "[data-popup-close]",
    popupNext: "[data-popup-next]",
  };

  stateClasses = {
    isActive: "is-active",
    isLock: "is-lock",
  };

  constructor() {
    this.popupElements = document.querySelectorAll(this.selectors.popup);
    this.body = document.querySelector("body");

    this.init();
  }

  init() {
    this.bindEvents();
  }

  bindEvents() {
    // Закрытие по оверлею и кнопке закрытия
    document.addEventListener("click", (e) => {
      if (
        e.target.matches(this.selectors.popupOverlay) ||
        e.target.closest(this.selectors.popupClose)
      ) {
        this.hideAll();
      }

      if (e.target.closest(this.selectors.popupNext)) {
        const popup = e.target.closest(this.selectors.popup);
        if (popup && popup.dataset.popup === "success") {
          this.hide("success");
          this.show("stage-completed");
        }
      }
    });

    // Закрытие по ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideAll();
      }
    });
  }

  show(popupName) {
    const popup = this.getPopup(popupName);
    if (popup) {
      this.hideAll();
      popup.classList.add(this.stateClasses.isActive);
      this.body.classList.add(this.stateClasses.isLock);

      popup.removeAttribute("aria-hidden");

      // Фокусируемся на первой фокусируемой кнопке
      const focusableElement = popup.querySelector("button");
      if (focusableElement) {
        focusableElement.focus();
      }
    }
  }

hide(popupName) {
  const popup = this.getPopup(popupName);
  if (popup) {
    // Сбрасываем фокус перед скрытием
    const focusedElement = popup.querySelector(':focus');
    if (focusedElement) {
      focusedElement.blur();
    }
    
    popup.classList.remove(this.stateClasses.isActive);
    popup.setAttribute("aria-hidden", "true");

    // Проверяем, есть ли еще активные попапы
    const hasActivePopups = Array.from(this.popupElements).some((popup) =>
      popup.classList.contains(this.stateClasses.isActive)
    );

    if (!hasActivePopups) {
      this.body.classList.remove(this.stateClasses.isLock);
    }
  }
}

hideAll() {
  this.popupElements.forEach((popup) => {
    // Сбрасываем фокус перед скрытием
    const focusedElement = popup.querySelector(':focus');
    if (focusedElement) {
      focusedElement.blur();
    }
    
    popup.classList.remove(this.stateClasses.isActive);
    popup.setAttribute("aria-hidden", "true");
  });
  this.body.classList.remove(this.stateClasses.isLock);
}

  getPopup(popupName) {
    return document.querySelector(`[data-popup="${popupName}"]`);
  }

  // Метод для проверки завершения кроссворда
  checkCrosswordCompletion(solvedWordsCount, totalWords) {
    if (solvedWordsCount >= totalWords) {
      this.show("success");
      return true;
    }
    return false;
  }
}

export default PopupController;
