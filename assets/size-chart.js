/*
 * Size chart section for Dawn.
 *
 * Two parts live in this file:
 * 1. SizeChartUtils: small pure functions (unit conversion, size matching,
 *    analytics payloads). They have no DOM access, so tests/size-chart.test.js
 *    can run them in Node.
 * 2. <size-chart>: the custom element used by sections/size-chart.liquid.
 *    It is only defined in a browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SizeChartUtils = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const CM_PER_INCH = 2.54;
  const UNITS = ['in', 'cm'];

  // Matches "36", "36.5", "34-36", "34 - 36" and "34–36" (en dash).
  const MEASUREMENT_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(?:([-–])\s*(\d+(?:\.\d+)?))?\s*$/;

  function isUnit(unit) {
    return UNITS.indexOf(unit) !== -1;
  }

  /** Returns { values: [number, ...], separator } or null when the text is not a measurement. */
  function parseMeasurement(text) {
    if (typeof text === 'number') {
      return Number.isFinite(text) ? { values: [text], separator: '' } : null;
    }
    if (typeof text !== 'string') return null;
    const match = MEASUREMENT_PATTERN.exec(text);
    if (!match) return null;
    const values = [parseFloat(match[1])];
    if (match[3] !== undefined) values.push(parseFloat(match[3]));
    return { values: values, separator: match[2] || '' };
  }

  function convertValue(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'in' && toUnit === 'cm') return value * CM_PER_INCH;
    if (fromUnit === 'cm' && toUnit === 'in') return value / CM_PER_INCH;
    throw new Error('Unsupported unit conversion: ' + fromUnit + ' to ' + toUnit);
  }

  /** Rounds to one decimal place and drops a trailing ".0" (91.44 -> "91.4", 36.0 -> "36"). */
  function formatNumber(value) {
    const rounded = Math.round(value * 10) / 10;
    return String(rounded);
  }

  /**
   * Converts one table cell. Text that is not a number or a simple range
   * (for example "One size" or "XL") is returned unchanged.
   */
  function convertCell(raw, fromUnit, toUnit) {
    const text = raw === null || raw === undefined ? '' : String(raw);
    if (!isUnit(fromUnit) || !isUnit(toUnit) || fromUnit === toUnit) return text;
    const parsed = parseMeasurement(text);
    if (!parsed) return text;
    return parsed.values
      .map(function (value) {
        return formatNumber(convertValue(value, fromUnit, toUnit));
      })
      .join(parsed.separator);
  }

  /** "  X-Large " and "x-large" match. Used to compare a variant's size with a chart row. */
  function normalizeSize(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /** Index of the chart row whose first column matches the size, or -1. */
  function findRowIndex(rowSizes, size) {
    const wanted = normalizeSize(size);
    if (!wanted) return -1;
    for (let i = 0; i < rowSizes.length; i += 1) {
      if (normalizeSize(rowSizes[i]) === wanted) return i;
    }
    return -1;
  }

  /**
   * Reads the size from a Shopify variant object. optionIndex is the
   * 0-based position of the "Size" option on the product, or -1 if the
   * product has no size option.
   */
  function sizeFromVariant(variant, optionIndex) {
    if (!variant || optionIndex < 0) return null;
    if (Array.isArray(variant.options) && variant.options[optionIndex] !== undefined) {
      return variant.options[optionIndex];
    }
    const key = 'option' + (optionIndex + 1);
    return variant[key] !== undefined ? variant[key] : null;
  }

  /** Clicking the pinned measurement again un-pins it; clicking another one switches to it. */
  function toggleMeasure(current, clicked) {
    if (!clicked) return current || null;
    return current === clicked ? null : clicked;
  }

  function variantBelongsToProduct(variant, variantIds) {
    if (!variant || variant.id === undefined || variant.id === null) return false;
    return variantIds.map(String).indexOf(String(variant.id)) !== -1;
  }

  /**
   * GA4 event names: lowercase snake_case, 40 characters max.
   * Parameters are kept flat so GTM can read each one with a Data Layer Variable.
   */
  const EVENTS = {
    open: 'size_chart_open',
    unitChange: 'size_chart_unit_change',
    sizeSelect: 'size_select',
  };

  function baseParams(context) {
    return {
      product_id: String(context.productId || ''),
      product_name: context.productTitle || '',
      chart_name: context.chartName || '',
      chart_display: context.display || '',
    };
  }

  function buildOpenEvent(context, trigger) {
    const params = baseParams(context);
    params.unit = context.unit || '';
    params.open_trigger = trigger;
    return { event: EVENTS.open, params: params };
  }

  function buildUnitChangeEvent(context, newUnit) {
    const params = baseParams(context);
    params.unit = newUnit;
    return { event: EVENTS.unitChange, params: params };
  }

  function buildSizeSelectEvent(context, variant, size, rowIndex, chartViewed) {
    const params = baseParams(context);
    params.variant_id = variant && variant.id !== undefined ? String(variant.id) : '';
    params.size = size === null || size === undefined ? '' : String(size);
    params.size_in_chart = rowIndex !== -1;
    params.chart_viewed = Boolean(chartViewed);
    return { event: EVENTS.sizeSelect, params: params };
  }

  /**
   * Sends one event two ways:
   * - window.dataLayer, which Google Tag Manager reads (Custom Event trigger).
   * - Shopify.analytics.publish, so a Shopify Custom Pixel can subscribe to it.
   * Returns the object pushed to the dataLayer (handy in tests).
   */
  function track(win, eventName, params) {
    if (!win) return null;
    const entry = Object.assign({ event: eventName }, params);
    win.dataLayer = win.dataLayer || [];
    win.dataLayer.push(entry);
    try {
      if (win.Shopify && win.Shopify.analytics && typeof win.Shopify.analytics.publish === 'function') {
        win.Shopify.analytics.publish(eventName, params);
      }
    } catch (error) {
      // Analytics must never break the product page.
    }
    return entry;
  }

  return {
    CM_PER_INCH: CM_PER_INCH,
    EVENTS: EVENTS,
    isUnit: isUnit,
    parseMeasurement: parseMeasurement,
    convertValue: convertValue,
    formatNumber: formatNumber,
    convertCell: convertCell,
    normalizeSize: normalizeSize,
    findRowIndex: findRowIndex,
    sizeFromVariant: sizeFromVariant,
    toggleMeasure: toggleMeasure,
    variantBelongsToProduct: variantBelongsToProduct,
    buildOpenEvent: buildOpenEvent,
    buildUnitChangeEvent: buildUnitChangeEvent,
    buildSizeSelectEvent: buildSizeSelectEvent,
    track: track,
  };
});

if (typeof window !== 'undefined' && window.customElements && !window.customElements.get('size-chart')) {
  class SizeChart extends HTMLElement {
    connectedCallback() {
      const utils = window.SizeChartUtils;
      this.utils = utils;
      this.display = this.dataset.display === 'inline' ? 'inline' : 'modal';
      this.sourceUnit = utils.isUnit(this.dataset.sourceUnit) ? this.dataset.sourceUnit : 'in';
      this.optionIndex = parseInt(this.dataset.optionIndex, 10);
      if (Number.isNaN(this.optionIndex)) this.optionIndex = -1;
      this.variantIds = this.readJson('[data-size-chart-variants]', []);
      this.dialog = this.querySelector('dialog');
      this.rows = Array.from(this.querySelectorAll('tbody tr'));
      this.rowSizes = this.rows.map((row) => row.dataset.size || '');
      this.viewed = false;
      this.unit = this.sourceUnit;

      document.documentElement.classList.add('has-size-chart');

      this.setUnit(utils.isUnit(this.dataset.defaultUnit) ? this.dataset.defaultUnit : this.sourceUnit, false);
      this.lastSize = this.dataset.initialSize || null;
      this.highlight(this.lastSize);

      this.querySelectorAll('[data-size-chart-unit]').forEach((button) => {
        button.addEventListener('click', () => this.setUnit(button.dataset.sizeChartUnit, true));
      });

      this.bindMeasures();

      if (this.display === 'modal' && this.dialog) {
        this.onTriggerClick = (event) => {
          const trigger = event.target.closest('[data-size-chart-open]');
          if (!trigger) return;
          event.preventDefault();
          this.open(trigger);
        };
        // Delegated on the document because Dawn re-renders the product info
        // (and the trigger button inside it) every time the variant changes.
        document.addEventListener('click', this.onTriggerClick);
        this.querySelectorAll('[data-size-chart-close]').forEach((button) => {
          button.addEventListener('click', () => this.close());
        });
        this.dialog.addEventListener('click', (event) => {
          if (event.target === this.dialog) this.close();
        });
        this.dialog.addEventListener('close', () => this.onDialogClosed());
      } else {
        this.observeInlineView();
      }

      if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
        this.unsubscribeVariant = subscribe(PUB_SUB_EVENTS.variantChange, (event) => {
          this.onVariantChange(event && event.data ? event.data.variant : null);
        });
      }
    }

    disconnectedCallback() {
      if (this.onTriggerClick) document.removeEventListener('click', this.onTriggerClick);
      if (this.unsubscribeVariant) this.unsubscribeVariant();
      if (this.observer) this.observer.disconnect();
    }

    /**
     * Fit guide: hovering a measurement column (or its line in the drawing)
     * previews it; clicking its header button pins it, which also works on
     * touch screens and with the keyboard.
     */
    bindMeasures() {
      this.pinnedMeasure = null;
      this.previewMeasure = null;
      this.querySelectorAll('[data-measure-trigger]').forEach((button) => {
        button.addEventListener('click', () => {
          this.pinnedMeasure = this.utils.toggleMeasure(this.pinnedMeasure, button.dataset.measureTrigger);
          this.renderMeasure();
        });
      });
      this.querySelectorAll('[data-measure]').forEach((element) => {
        element.addEventListener('pointerenter', () => {
          this.previewMeasure = element.dataset.measure;
          this.renderMeasure();
        });
        element.addEventListener('pointerleave', () => {
          this.previewMeasure = null;
          this.renderMeasure();
        });
      });
    }

    renderMeasure() {
      const active = this.previewMeasure || this.pinnedMeasure;
      if (active) {
        this.dataset.activeMeasure = active;
      } else {
        delete this.dataset.activeMeasure;
      }
      this.querySelectorAll('[data-measure-trigger]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.measureTrigger === this.pinnedMeasure));
      });
    }

    readJson(selector, fallback) {
      const element = this.querySelector(selector);
      if (!element) return fallback;
      try {
        return JSON.parse(element.textContent);
      } catch (error) {
        return fallback;
      }
    }

    context() {
      return {
        productId: this.dataset.productId,
        productTitle: this.dataset.productTitle,
        chartName: this.dataset.chartName,
        display: this.display,
        unit: this.unit,
      };
    }

    send(built) {
      this.utils.track(window, built.event, built.params);
    }

    open(trigger) {
      if (!this.dialog || this.dialog.open) return;
      this.lastTrigger = trigger || null;
      this.dialog.showModal();
      document.body.classList.add('overflow-hidden');
      this.viewed = true;
      this.send(this.utils.buildOpenEvent(this.context(), 'button'));
    }

    close() {
      if (this.dialog && this.dialog.open) this.dialog.close();
    }

    onDialogClosed() {
      document.body.classList.remove('overflow-hidden');
      // The trigger may have been replaced by a re-render, so fall back to any trigger on the page.
      const target =
        this.lastTrigger && this.lastTrigger.isConnected
          ? this.lastTrigger
          : document.querySelector('[data-size-chart-open]');
      if (target) target.focus();
    }

    observeInlineView() {
      if (!('IntersectionObserver' in window)) return;
      const table = this.querySelector('.size-chart__table-wrapper');
      if (!table) return;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          this.observer.disconnect();
          this.viewed = true;
          this.send(this.utils.buildOpenEvent(this.context(), 'inline_view'));
        },
        { threshold: 0.5 }
      );
      this.observer.observe(table);
    }

    setUnit(unit, userAction) {
      if (!this.utils.isUnit(unit)) return;
      const changed = unit !== this.unit;
      this.unit = unit;
      this.querySelectorAll('[data-raw]').forEach((cell) => {
        cell.textContent = this.utils.convertCell(cell.dataset.raw, this.sourceUnit, unit);
      });
      this.querySelectorAll('[data-size-chart-unit]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.sizeChartUnit === unit));
      });
      const unitLabel = (unit === 'cm' ? this.dataset.labelCm : this.dataset.labelIn) || unit;
      this.querySelectorAll('[data-unit-label]').forEach((label) => {
        label.textContent = unitLabel;
      });
      if (userAction && changed) this.send(this.utils.buildUnitChangeEvent(this.context(), unit));
    }

    highlight(size) {
      const index = this.utils.findRowIndex(this.rowSizes, size);
      this.rows.forEach((row, rowIndex) => {
        if (rowIndex === index) {
          row.classList.add('size-chart__row--selected');
          row.setAttribute('aria-current', 'true');
        } else {
          row.classList.remove('size-chart__row--selected');
          row.removeAttribute('aria-current');
        }
      });
      return index;
    }

    onVariantChange(variant) {
      // Quick-add modals publish the same event, so ignore variants from other products.
      if (!this.utils.variantBelongsToProduct(variant, this.variantIds)) return;
      const size = this.utils.sizeFromVariant(variant, this.optionIndex);
      if (size === null) return;
      // Changing only the colour keeps the same size: no new size_select event.
      if (this.utils.normalizeSize(size) === this.utils.normalizeSize(this.lastSize)) return;
      this.lastSize = size;
      const rowIndex = this.highlight(size);
      this.send(this.utils.buildSizeSelectEvent(this.context(), variant, size, rowIndex, this.viewed));
    }
  }

  window.customElements.define('size-chart', SizeChart);
}
