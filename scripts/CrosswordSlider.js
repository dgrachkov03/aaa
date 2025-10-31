class CrosswordSlider {
  selectors = {
    slider: '[data-crossword-slider]',
    preview: '[data-crossword-preview]',
    sliderWrapper: '[data-crossword-slider-wrapper]',
    buttonPrev: '[data-crossword-slider-button-prev]',
    buttonNext: '[data-crossword-slider-button-next]',
  };

  constructor(sliderData, onQuestionChange = null) {
    this.sliderData = sliderData;
    this.onQuestionChange = onQuestionChange;
    
    this.sliderElement = document.querySelector(this.selectors.slider);
    this.previewElement = document.querySelector(this.selectors.preview);
    this.sliderWrapperElement = this.sliderElement.querySelector(this.selectors.sliderWrapper);
    this.prevButtonElement = this.sliderElement.querySelector(this.selectors.buttonPrev);
    this.nextButtonElement = this.sliderElement.querySelector(this.selectors.buttonNext);
    
    this.slider = null;
    this.isActive = false;
    this.isInitialized = false;

    this.createSlides();
    this.hide();
  }

  createSlides() {
    this.sliderWrapperElement.innerHTML = "";

    Object.entries(this.sliderData.words).forEach(([wordId, wordData]) => {
      const slide = document.createElement("div");
      slide.className = "crossword-slider__slide swiper-slide";
      slide.dataset.wordId = wordId;

      slide.innerHTML = `
        <div class="crossword-slider__slide-content">
          <span class="crossword-slider__slide-count">${wordId}.</span>
          ${wordData.question}
        </div>
      `;

      this.sliderWrapperElement.appendChild(slide);
    });
  }

  initSwiper(initialSlide = 0) {
    if (this.isInitialized) return;
    
    this.slider = new Swiper(this.sliderElement, {
      slidesPerView: 1,
      spaceBetween: 0,
      autoHeight: false,
      initialSlide: initialSlide,
      navigation: {
        nextEl: this.nextButtonElement,
        prevEl: this.prevButtonElement,
      },
      on: {
        slideChange: () => {
          if (this.onQuestionChange && this.isActive) {
            const currentWordId = this.getCurrentQuestion();
            this.onQuestionChange(currentWordId);
          }
        }
      }
    });
    
    this.isInitialized = true;
  }

  show() {
    if (!this.isActive) {
      this.previewElement.classList.remove('is-active');
      this.sliderElement.classList.add('is-active');
      this.isActive = true;

      if (this.slider) {
        setTimeout(() => {
          this.slider.update();
          this.slider.updateAutoHeight();
        }, 50);
      }
    }
  }

  hide() {
    this.previewElement.classList.add('is-active');
    this.sliderElement.classList.remove('is-active');
    this.isActive = false;
  }

  goToQuestion(wordId) {
    const slideIndex = this.getSlideIndex(wordId);
    
    if (!this.isInitialized) {
      this.initSwiper(slideIndex);
    } else {
      // Временно отключаем обработчик slideChange
      this.slider.off('slideChange');
      this.slider.slideTo(slideIndex);
      
      // Включаем обратно после небольшой задержки
      setTimeout(() => {
        this.slider.on('slideChange', () => {
          if (this.onQuestionChange && this.isActive) {
            const currentWordId = this.getCurrentQuestion();
            this.onQuestionChange(currentWordId);
          }
        });
      }, 100);
    }
    
    this.show();
  }

  getSlideIndex(wordId) {
    const slides = this.sliderWrapperElement.querySelectorAll('.swiper-slide');
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].dataset.wordId === wordId.toString()) {
        return i;
      }
    }
    return 0;
  }

  getCurrentQuestion() {
    if (!this.slider || !this.isInitialized) return null;
    const activeSlide = this.slider.slides[this.slider.activeIndex];
    return activeSlide ? activeSlide.dataset.wordId : null;
  }
}

export default CrosswordSlider;