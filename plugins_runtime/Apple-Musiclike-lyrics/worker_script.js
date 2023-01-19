(() => {
  // src/global-events.ts
  var GLOBAL_EVENTS = new EventTarget();

  // src/utils.ts
  function debounce(callback, waitTime) {
    let timer = 0;
    return function debounceClosure() {
      const self2 = this;
      const args = arguments;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(callback.bind(self2, args), waitTime);
    };
  }
  function genRandomString(length) {
    const words = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    const result = [];
    for (let i = 0; i < length; i++) {
      result.push(words.charAt(Math.floor(Math.random() * words.length)));
    }
    return result.join("");
  }
  var IS_WORKER = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;

  // src/logger.ts
  var log = true ? IS_WORKER ? (...args) => console.log("[AMLL-Worker]", ...args) : console.log : noop;
  var warn = IS_WORKER ? (...args) => console.warn("[AMLL-Worker]", ...args) : console.warn;
  var error = IS_WORKER ? (...args) => console.error("[AMLL-Worker]", ...args) : console.error;

  // manifest.json
  var slug = "Apple-Musiclike-lyrics";

  // src/config/core.ts
  var _a, _b;
  var PLUGIN_CONFIG_KEY = `config.betterncm.${"plugin" in globalThis ? ((_a = plugin == null ? void 0 : plugin.manifest) == null ? void 0 : _a.slug) || ((_b = plugin == null ? void 0 : plugin.manifest) == null ? void 0 : _b.name) || slug : slug}`;
  var GLOBAL_CONFIG = loadConfig();
  function loadConfig() {
    if (IS_WORKER) {
      return {};
    }
    try {
      return JSON.parse(localStorage.getItem(PLUGIN_CONFIG_KEY) || "{}");
    } catch (err) {
      warn("\u8B66\u544A\uFF1AAMLL \u63D2\u4EF6\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25", err);
      return {};
    }
  }
  var saveConfig = debounce(function saveConfig2() {
    if (IS_WORKER) {
      GLOBAL_EVENTS.dispatchEvent(new Event("config-saved"));
      return;
    }
    try {
      localStorage.setItem(PLUGIN_CONFIG_KEY, JSON.stringify(GLOBAL_CONFIG));
    } catch (err) {
      warn("\u8B66\u544A\uFF1AAMLL \u63D2\u4EF6\u914D\u7F6E\u4FDD\u5B58\u5931\u8D25", err);
    }
    GLOBAL_EVENTS.dispatchEvent(new Event("config-saved"));
  }, 2e3);
  function setConfig(key, value) {
    if (!IS_WORKER)
      setConfigFromMain({ [key]: value });
    if (value === void 0) {
      delete GLOBAL_CONFIG[key];
    } else {
      GLOBAL_CONFIG[key] = value;
    }
    saveConfig();
  }

  // src/worker/color-quantize/p-queue.ts
  var PQueue = class extends Array {
    constructor(_comparator = (a, b) => Number(a) - Number(b)) {
      super();
      this._comparator = _comparator;
      this._sorted = false;
      this.sort = (comparator) => {
        this._comparator = comparator ? comparator : this._comparator;
        this._sorted = true;
        return super.sort(this._comparator);
      };
      this.push = (o) => {
        this._sorted = false;
        return super.push(o);
      };
      this.pop = () => {
        if (!this._sorted)
          this.sort();
        return super.pop();
      };
      /**
       * 获取下标元素(默认获取最后一位元素)
       * @param index
       * @returns
       */
      this.peek = (index) => {
        if (!this._sorted)
          this.sort();
        if (index === void 0)
          index = this.length - 1;
        return this[index];
      };
      this.size = () => {
        return this.length;
      };
      this.debug = () => {
        if (!this._sorted)
          this.sort();
        return this;
      };
    }
  };

  // src/worker/color-quantize/v-box.ts
  var VBox = class {
    constructor(r1, r2, g1, g2, b1, b2, histo) {
      this.r1 = r1;
      this.r2 = r2;
      this.g1 = g1;
      this.g2 = g2;
      this.b1 = b1;
      this.b2 = b2;
      this.histo = histo;
      this._count = -1;
      this._volume = 0;
      this._avg = [];
      /**
       * 色彩空间体积（即 r,g,b 三维长方体体积）
       * @param force 强制重算
       * @returns
       */
      this.volume = (force) => {
        if (this._volume && !force) {
          return this._volume;
        }
        this._volume = (this.r2 - this.r1 + 1) * (this.g2 - this.g1 + 1) * (this.b2 - this.b1 + 1);
        return this._volume;
      };
      /**
       * 获取 vbox 内的总像素数
       * @param force 强制重算
       * @returns
       */
      this.count = (force) => {
        if (this._count > -1 && !force) {
          return this._count;
        }
        let count = 0;
        let i;
        let j;
        let k;
        let index;
        for (i = this.r1; i <= this.r2; i++) {
          for (j = this.g1; j <= this.g2; j++) {
            for (k = this.b1; k <= this.b2; k++) {
              index = getColorIndex(i, j, k);
              count += this.histo[index] || 0;
            }
          }
        }
        this._count = count;
        return this._count;
      };
      this.copy = () => {
        return new VBox(
          this.r1,
          this.r2,
          this.g1,
          this.g2,
          this.b1,
          this.b2,
          this.histo
        );
      };
      /**
       * 色彩空间平均颜色
       * @param force
       * @returns
       */
      this.avg = (force) => {
        if (this._avg.length && force) {
          return this._avg;
        }
        let ntot = 0;
        let mult = 1 << rshift;
        let rsum = 0;
        let gsum = 0;
        let bsum = 0;
        let hval;
        let i;
        let j;
        let k;
        let histoindex;
        for (i = this.r1; i <= this.r2; i++) {
          for (j = this.g1; j <= this.g2; j++) {
            for (k = this.b1; k <= this.b2; k++) {
              histoindex = getColorIndex(i, j, k);
              hval = this.histo[histoindex] || 0;
              ntot += hval;
              rsum += hval * (i + 0.5) * mult;
              gsum += hval * (j + 0.5) * mult;
              bsum += hval * (k + 0.5) * mult;
            }
          }
        }
        if (ntot) {
          this._avg = [~~(rsum / ntot), ~~(gsum / ntot), ~~(bsum / ntot)];
        } else {
          this._avg = [
            ~~(mult * (this.r1 + this.r2 + 1) / 2),
            ~~(mult * (this.g1 + this.g2 + 1) / 2),
            ~~(mult * (this.b1 + this.b2 + 1) / 2)
          ];
        }
        return this._avg;
      };
      /**
       * 像素是否在vbox色彩空间内
       * @param pixel
       * @returns
       */
      this.contains = (pixel) => {
        const [rval, gval, bval] = pixel.map((num) => num >> rshift);
        return rval >= this.r1 && rval <= this.r2 && gval >= this.g1 && gval <= this.g2 && bval >= this.b1 && bval <= this.b2;
      };
    }
  };

  // src/worker/color-quantize/utils.ts
  var sigbits = 5;
  var rshift = 8 - sigbits;
  var maxIterations = 1e3;
  var fractByPopulations = 0.75;
  var pv = {
    naturalOrder: (a, b) => {
      return a < b ? -1 : a > b ? 1 : 0;
    },
    sum: (array, f) => {
      return array.reduce((p, t) => {
        return p + (f ? f.call(array, t) : Number(t));
      }, 0);
    },
    max: (array, f) => {
      return Math.max.apply(null, f ? array.map(f) : array.map((d) => Number(d)));
    },
    size: (array) => {
      return array.reduce((p, t) => t ? p + 1 : p, 0);
    }
  };
  var getColorIndex = (r, g, b) => {
    return (r << 2 * sigbits) + (g << sigbits) + b;
  };
  var getHistoAndVBox = (pixels) => {
    let histo = new Array(1 << 3 * sigbits);
    let index;
    let rmin = Infinity;
    let rmax = 0;
    let gmin = Infinity;
    let gmax = 0;
    let bmin = Infinity;
    let bmax = 0;
    let rval;
    let gval;
    let bval;
    pixels.forEach(function(pixel) {
      [rval, gval, bval] = pixel.map((num) => num >> rshift);
      index = getColorIndex(rval, gval, bval);
      histo[index] = (histo[index] || 0) + 1;
      if (rval < rmin)
        rmin = rval;
      else if (rval > rmax)
        rmax = rval;
      if (gval < gmin)
        gmin = gval;
      else if (gval > gmax)
        gmax = gval;
      if (bval < bmin)
        bmin = bval;
      else if (bval > bmax)
        bmax = bval;
    });
    return {
      vbox: new VBox(rmin, rmax, gmin, gmax, bmin, bmax, histo),
      histo
    };
  };
  var medianCutApply = (histo, vbox) => {
    if (!vbox.count())
      return [];
    if (vbox.count() === 1) {
      return [vbox.copy()];
    }
    const rw = vbox.r2 - vbox.r1 + 1;
    const gw = vbox.g2 - vbox.g1 + 1;
    const bw = vbox.b2 - vbox.b1 + 1;
    const maxw = pv.max([rw, gw, bw]);
    const partialsum = [];
    let total = 0;
    let i;
    let j;
    let k;
    let sum;
    let index;
    if (maxw === rw) {
      for (i = vbox.r1; i <= vbox.r2; i++) {
        sum = 0;
        for (j = vbox.g1; j <= vbox.g2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(i, j, k);
            sum += histo[index] || 0;
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else if (maxw === gw) {
      for (i = vbox.g1; i <= vbox.g2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.b1; k <= vbox.b2; k++) {
            index = getColorIndex(j, i, k);
            sum += histo[index] || 0;
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    } else {
      for (i = vbox.b1; i <= vbox.b2; i++) {
        sum = 0;
        for (j = vbox.r1; j <= vbox.r2; j++) {
          for (k = vbox.g1; k <= vbox.g2; k++) {
            index = getColorIndex(j, k, i);
            sum += histo[index] || 0;
          }
        }
        total += sum;
        partialsum[i] = total;
      }
    }
    const doCut = (color) => {
      const dim1 = `${color}1`;
      const dim2 = `${color}2`;
      let left;
      let right;
      let vbox1;
      let vbox2;
      let cutIndex;
      for (i = vbox[dim1]; i <= vbox[dim2]; i++) {
        if (partialsum[i] >= total / 2) {
          break;
        }
      }
      vbox1 = vbox.copy();
      vbox2 = vbox.copy();
      left = i - vbox[dim1];
      right = vbox[dim2] - i;
      cutIndex = left <= right ? Math.min(vbox[dim2] - 1, ~~(i + right / 2)) : Math.max(vbox[dim1], ~~(i - 1 - left / 2));
      while (!partialsum[cutIndex] && cutIndex <= vbox[dim2])
        cutIndex++;
      vbox1[dim2] = cutIndex;
      vbox2[dim1] = cutIndex + 1;
      return [vbox1, vbox2];
    };
    return maxw === rw ? doCut("r") : maxw === gw ? doCut("g") : doCut("b");
  };

  // src/worker/color-quantize/c-map.ts
  var _CMap = class {
    constructor() {
      this.push = (vbox) => {
        this.vboxes.push({
          vbox,
          color: vbox.avg()
          // 根据色彩空间平均色取 近似色
        });
      };
      /**
       * 获取所有色彩空间颜色
       * @returns
       */
      this.palette = () => {
        return this.vboxes.map((vb) => vb.color);
      };
      /**
       * 色彩空间size
       * @returns
       */
      this.size = () => {
        return this.vboxes.size();
      };
      /**
       * 匹配当前色彩空间近似值
       * @param color
       * @returns
       */
      this.map = (color) => {
        for (let i = 0; i < this.vboxes.size(); i++) {
          if (this.vboxes.peek(i).vbox.contains(color)) {
            return this.vboxes.peek(i).color;
          }
        }
        return this.nearest(color);
      };
      /**
       * 获取当前颜色近似值
       * @param color
       * @returns
       */
      this.nearest = (color) => {
        let i, d1, d2, pColor;
        for (i = 0; i < this.vboxes.size(); i++) {
          d2 = Math.sqrt(
            Math.pow(color[0] - this.vboxes.peek(i).color[0], 2) + Math.pow(color[1] - this.vboxes.peek(i).color[1], 2) + Math.pow(color[2] - this.vboxes.peek(i).color[2], 2)
          );
          if (d1 === void 0 || d2 < d1) {
            d1 = d2;
            pColor = this.vboxes.peek(i).color;
          }
        }
        return pColor;
      };
      /**
       * 当色彩空间接近极值时，直接取纯黑白色
       */
      this.forcebw = () => {
        this.vboxes.sort((a, b) => {
          return pv.naturalOrder(pv.sum(a.color), pv.sum(b.color));
        });
        const lowest = this.vboxes[0].color;
        if (lowest[0] < 5 && lowest[1] < 5 && lowest[2] < 5)
          this.vboxes[0].color = [0, 0, 0];
        const idx = this.vboxes.length - 1, highest = this.vboxes[idx].color;
        if (highest[0] > 251 && highest[1] > 251 && highest[2] > 251)
          this.vboxes[idx].color = [255, 255, 255];
        this.vboxes.sort(_CMap._compare);
      };
      this.vboxes = new PQueue(_CMap._compare);
    }
  };
  var CMap = _CMap;
  /**
   * 色彩空间 默认比较函数
   */
  CMap._compare = (a, b) => {
    return pv.naturalOrder(
      a.vbox.count() * a.vbox.volume(),
      b.vbox.count() * b.vbox.volume()
    );
  };

  // src/worker/color-quantize/quantize.ts
  var quantize = (pixels, maxcolors) => {
    if (!pixels.length || maxcolors < 1 || maxcolors > 256) {
      return new CMap();
    }
    const { histo, vbox } = getHistoAndVBox(pixels);
    const pq = new PQueue((a, b) => {
      return pv.naturalOrder(a.count(), b.count());
    });
    pq.push(vbox);
    const iter = (vboxQueue, target) => {
      let vboxSize = vboxQueue.size();
      let tempIterations = 0;
      let vbox2;
      while (tempIterations < maxIterations) {
        if (vboxSize >= target)
          return;
        if (tempIterations++ > maxIterations)
          return;
        if (!vboxQueue.peek().count())
          return;
        vbox2 = vboxQueue.pop();
        const [vbox1, vbox22] = medianCutApply(histo, vbox2);
        if (!vbox1) {
          return;
        }
        vboxQueue.push(vbox1);
        if (vbox22) {
          vboxQueue.push(vbox22);
          vboxSize++;
        }
      }
    };
    iter(pq, fractByPopulations * maxcolors);
    pq.sort((a, b) => {
      return pv.naturalOrder(a.count() * a.volume(), b.count() * b.volume());
    });
    iter(pq, maxcolors);
    const cmap = new CMap();
    while (pq.size()) {
      cmap.push(pq.pop());
    }
    return cmap;
  };

  // src/worker/index.ts
  var worker;
  var definedFunctions = {};
  var callbacks = /* @__PURE__ */ new Map();
  function defineWorkerFunction(funcName, funcBody, transferArgIndexes = []) {
    definedFunctions[funcName] = {
      funcName,
      funcBody
    };
    let callId = 0;
    return (...args) => {
      if (worker) {
        return new Promise((resolve, reject) => {
          const id = `${genRandomString(4)} - ${funcName} - ${callId++}`;
          callbacks.set(id, [resolve, reject]);
          worker.postMessage(
            {
              id,
              funcName,
              args
            },
            transferArgIndexes.map((i) => args[i]).filter((v) => !!v)
          );
        });
      } else {
        warn("AMLL Worker \u5C1A\u672A\u8FD0\u884C\uFF0C\u6B63\u5728\u672C\u5730\u7EBF\u7A0B\u6267\u884C\u51FD\u6570", funcName, args);
        try {
          const result = funcBody(...args);
          return Promise.resolve(result);
        } catch (err) {
          return Promise.reject(err);
        }
      }
    };
  }
  var grabImageColors = defineWorkerFunction(
    "grabImageColors",
    async (img, maxColors = 16) => {
      const canvas = new OffscreenCanvas(img.width, img.height);
      const ctx = canvas.getContext(
        "2d"
      );
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = [];
        for (let i = 0; i < data.width * data.height; i++) {
          pixels.push([
            data.data[i * 4],
            data.data[i * 4 + 1],
            data.data[i * 4 + 2]
          ]);
        }
        const result = quantize(pixels, maxColors);
        const colors = [];
        result.palette().forEach((color) => colors.push(color));
        return colors;
      } else {
        return [];
      }
    }
  );
  var setConfigFromMain = defineWorkerFunction(
    "setConfigFromMain",
    (config) => {
      if (IS_WORKER) {
        for (const key in config) {
          setConfig(key, config[key]);
        }
        log("\u5DF2\u4ECE\u4E3B\u7EBF\u7A0B\u540C\u6B65\u914D\u7F6E", ...Object.keys(config));
      }
    }
  );

  // src/worker_script.ts
  onmessage = async (evt) => {
    try {
      log("\u6B63\u5728\u6267\u884C\u540E\u53F0\u4EFB\u52A1", evt.data.id, evt.data.funcName, evt.data.args);
      const ret = definedFunctions[evt.data.funcName].funcBody(...evt.data.args);
      const result = await ret;
      postMessage({
        id: evt.data.id,
        result
      });
    } catch (err) {
      error(
        "\u540E\u53F0\u4EFB\u52A1\u53D1\u751F\u9519\u8BEF",
        evt.data.id,
        evt.data.funcName,
        evt.data.args,
        err
      );
      postMessage({
        id: evt.data.id,
        result: void 0,
        error: err
      });
    }
  };
  log("AMLL \u540E\u53F0\u7EBF\u7A0B\u6B63\u5728\u8FD0\u884C\uFF01");
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vLi4vc3JjL2dsb2JhbC1ldmVudHMudHMiLCAiLi4vLi4vLi4vLi4vc3JjL3V0aWxzLnRzIiwgIi4uLy4uLy4uLy4uL3NyYy9sb2dnZXIudHMiLCAiLi4vLi4vLi4vLi4vbWFuaWZlc3QuanNvbiIsICIuLi8uLi8uLi8uLi9zcmMvY29uZmlnL2NvcmUudHMiLCAiLi4vLi4vLi4vLi4vc3JjL3dvcmtlci9jb2xvci1xdWFudGl6ZS9wLXF1ZXVlLnRzIiwgIi4uLy4uLy4uLy4uL3NyYy93b3JrZXIvY29sb3ItcXVhbnRpemUvdi1ib3gudHMiLCAiLi4vLi4vLi4vLi4vc3JjL3dvcmtlci9jb2xvci1xdWFudGl6ZS91dGlscy50cyIsICIuLi8uLi8uLi8uLi9zcmMvd29ya2VyL2NvbG9yLXF1YW50aXplL2MtbWFwLnRzIiwgIi4uLy4uLy4uLy4uL3NyYy93b3JrZXIvY29sb3ItcXVhbnRpemUvcXVhbnRpemUudHMiLCAiLi4vLi4vLi4vLi4vc3JjL3dvcmtlci9pbmRleC50cyIsICIuLi8uLi8uLi8uLi9zcmMvd29ya2VyX3NjcmlwdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiZXhwb3J0IGNvbnN0IEdMT0JBTF9FVkVOVFMgPSBuZXcgRXZlbnRUYXJnZXQoKTtcbiIsICJleHBvcnQgZnVuY3Rpb24gZGVib3VuY2U8VCBleHRlbmRzIEZ1bmN0aW9uPihjYWxsYmFjazogVCwgd2FpdFRpbWU6IG51bWJlcik6IFQge1xuXHRsZXQgdGltZXIgPSAwO1xuXHRyZXR1cm4gZnVuY3Rpb24gZGVib3VuY2VDbG9zdXJlKCkge1xuXHRcdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRcdC8vIHJvbWUtaWdub3JlIGxpbnQvc3R5bGUvbm9Bcmd1bWVudHM6IFx1OTYzMlx1NjI5Nlx1NTFGRFx1NjU3MFxuXHRcdGNvbnN0IGFyZ3MgPSBhcmd1bWVudHM7XG5cdFx0aWYgKHRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdH1cblx0XHR0aW1lciA9IHNldFRpbWVvdXQoY2FsbGJhY2suYmluZChzZWxmLCBhcmdzKSwgd2FpdFRpbWUpO1xuXHR9IGFzIHVua25vd24gYXMgVDtcbn1cblxuLyogZXNsaW50LWRpc2FibGUgbWF4LWRlcHRoLCBtYXgtc3RhdGVtZW50cywgY29tcGxleGl0eSwgbWF4LWxpbmVzLXBlci1mdW5jdGlvbiAqL1xuY29uc3QgU0xBU0ggPSA0NztcbmNvbnN0IERPVCA9IDQ2O1xuXG5jb25zdCBhc3NlcnRQYXRoID0gKHBhdGg6IHN0cmluZykgPT4ge1xuXHRjb25zdCB0ID0gdHlwZW9mIHBhdGg7XG5cdGlmICh0ICE9PSBcInN0cmluZ1wiKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcihgRXhwZWN0ZWQgYSBzdHJpbmcsIGdvdCBhICR7dH1gKTtcblx0fVxufTtcblxuLy8gdGhpcyBmdW5jdGlvbiBpcyBkaXJlY3RseSBmcm9tIG5vZGUgc291cmNlXG5jb25zdCBwb3NpeE5vcm1hbGl6ZSA9IChwYXRoOiBzdHJpbmcsIGFsbG93QWJvdmVSb290OiBib29sZWFuKSA9PiB7XG5cdGxldCByZXMgPSBcIlwiO1xuXHRsZXQgbGFzdFNlZ21lbnRMZW5ndGggPSAwO1xuXHRsZXQgbGFzdFNsYXNoID0gLTE7XG5cdGxldCBkb3RzID0gMDtcblx0bGV0IGNvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8PSBwYXRoLmxlbmd0aDsgKytpKSB7XG5cdFx0aWYgKGkgPCBwYXRoLmxlbmd0aCkge1xuXHRcdFx0Y29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcblx0XHR9IGVsc2UgaWYgKGNvZGUgPT09IFNMQVNIKSB7XG5cdFx0XHRicmVhaztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29kZSA9IFNMQVNIO1xuXHRcdH1cblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpIHtcblx0XHRcdGlmIChsYXN0U2xhc2ggPT09IGkgLSAxIHx8IGRvdHMgPT09IDEpIHtcblx0XHRcdFx0Ly8gTk9PUFxuXHRcdFx0fSBlbHNlIGlmIChsYXN0U2xhc2ggIT09IGkgLSAxICYmIGRvdHMgPT09IDIpIHtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHJlcy5sZW5ndGggPCAyIHx8XG5cdFx0XHRcdFx0bGFzdFNlZ21lbnRMZW5ndGggIT09IDIgfHxcblx0XHRcdFx0XHRyZXMuY2hhckNvZGVBdChyZXMubGVuZ3RoIC0gMSkgIT09IERPVCB8fFxuXHRcdFx0XHRcdHJlcy5jaGFyQ29kZUF0KHJlcy5sZW5ndGggLSAyKSAhPT0gRE9UXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGlmIChyZXMubGVuZ3RoID4gMikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdFNsYXNoSW5kZXggPSByZXMubGFzdEluZGV4T2YoXCIvXCIpO1xuXHRcdFx0XHRcdFx0aWYgKGxhc3RTbGFzaEluZGV4ICE9PSByZXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0XHRpZiAobGFzdFNsYXNoSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzID0gXCJcIjtcblx0XHRcdFx0XHRcdFx0XHRsYXN0U2VnbWVudExlbmd0aCA9IDA7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzID0gcmVzLnNsaWNlKDAsIGxhc3RTbGFzaEluZGV4KTtcblx0XHRcdFx0XHRcdFx0XHRsYXN0U2VnbWVudExlbmd0aCA9IHJlcy5sZW5ndGggLSAxIC0gcmVzLmxhc3RJbmRleE9mKFwiL1wiKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRsYXN0U2xhc2ggPSBpO1xuXHRcdFx0XHRcdFx0XHRkb3RzID0gMDtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZXMubGVuZ3RoID09PSAyIHx8IHJlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHJlcyA9IFwiXCI7XG5cdFx0XHRcdFx0XHRsYXN0U2VnbWVudExlbmd0aCA9IDA7XG5cdFx0XHRcdFx0XHRsYXN0U2xhc2ggPSBpO1xuXHRcdFx0XHRcdFx0ZG90cyA9IDA7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFsbG93QWJvdmVSb290KSB7XG5cdFx0XHRcdFx0aWYgKHJlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXMgKz0gXCIvLi5cIjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzID0gXCIuLlwiO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0U2VnbWVudExlbmd0aCA9IDI7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChyZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJlcyArPSBgLyR7cGF0aC5zbGljZShsYXN0U2xhc2ggKyAxLCBpKX1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlcyA9IHBhdGguc2xpY2UobGFzdFNsYXNoICsgMSwgaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFNlZ21lbnRMZW5ndGggPSBpIC0gbGFzdFNsYXNoIC0gMTtcblx0XHRcdH1cblx0XHRcdGxhc3RTbGFzaCA9IGk7XG5cdFx0XHRkb3RzID0gMDtcblx0XHR9IGVsc2UgaWYgKGNvZGUgPT09IERPVCAmJiBkb3RzICE9PSAtMSkge1xuXHRcdFx0Kytkb3RzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb3RzID0gLTE7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlcztcbn07XG5cbmNvbnN0IGRlY29kZSA9IChzOiBzdHJpbmcpID0+IHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHMpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gcztcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IG5vcm1hbGl6ZVBhdGggPSAocDogc3RyaW5nKSA9PiB7XG5cdGFzc2VydFBhdGgocCk7XG5cblx0bGV0IHBhdGggPSBwLnJlcGxhY2VBbGwoXCJcXFxcXCIsIFwiL1wiKTtcblx0aWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFwiLlwiO1xuXHR9XG5cblx0Y29uc3QgaXNBYnNvbHV0ZSA9IHBhdGguY2hhckNvZGVBdCgwKSA9PT0gU0xBU0g7XG5cdGNvbnN0IHRyYWlsaW5nU2VwYXJhdG9yID0gcGF0aC5jaGFyQ29kZUF0KHBhdGgubGVuZ3RoIC0gMSkgPT09IFNMQVNIO1xuXG5cdHBhdGggPSBkZWNvZGUocGF0aCk7XG5cdHBhdGggPSBwb3NpeE5vcm1hbGl6ZShwYXRoLCAhaXNBYnNvbHV0ZSk7XG5cblx0aWYgKHBhdGgubGVuZ3RoID09PSAwICYmICFpc0Fic29sdXRlKSB7XG5cdFx0cGF0aCA9IFwiLlwiO1xuXHR9XG5cdGlmIChwYXRoLmxlbmd0aCA+IDAgJiYgdHJhaWxpbmdTZXBhcmF0b3IpIHtcblx0XHRwYXRoICs9IFwiL1wiO1xuXHR9XG5cdGlmIChpc0Fic29sdXRlKSB7XG5cdFx0cmV0dXJuIGAvJHtwYXRofWA7XG5cdH1cblxuXHRyZXR1cm4gcGF0aDtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZW5SYW5kb21TdHJpbmcobGVuZ3RoOiBudW1iZXIpIHtcblx0Y29uc3Qgd29yZHMgPSBcIjAxMjM0NTY3ODlBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hUWmFiY2RlZmdoaWtsbW5vcHFyc3R1dnd4eXpcIjtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0cmVzdWx0LnB1c2god29yZHMuY2hhckF0KE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHdvcmRzLmxlbmd0aCkpKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0LmpvaW4oXCJcIik7XG59XG5cbi8vIFx1NzMxQ1x1NkQ0Qlx1NkI0Q1x1OEJDRFx1NzY4NFx1OTYwNVx1OEJGQlx1NjVGNlx1OTVGNFx1RkYwQ1x1NTkyN1x1Njk4Mlx1NjgzOVx1NjM2RVx1NEUyRFx1NjVFNVx1ODJGMVx1NjU4N1x1N0I4MFx1NTM1NVx1OEJBMVx1N0I5N1x1RkYwQ1x1OEZENFx1NTZERVx1NTM1NVx1NEY0RFx1NkJFQlx1NzlEMlx1NzY4NFx1OTYwNVx1OEJGQlx1NjVGNlx1OTVGNFxuZXhwb3J0IGZ1bmN0aW9uIGd1ZXNzVGV4dFJlYWREdXJhdGlvbih0ZXh0OiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCB3b3JkUmVnZXhwID0gL14oW0EtWmEtelxcdTAwQzAtXFx1MDBENlxcdTAwRDgtXFx1MDBmNlxcdTAwZjgtXFx1MDBmZlxcLV0rKSQvO1xuXHRsZXQgd29yZENvdW50ID0gMDtcblx0Ly8gXHU0RUU1XHU3QTdBXHU2ODNDXHU1NDhDXHU1NDA0XHU3OUNEXHU2ODA3XHU3MEI5XHU3QjI2XHU1M0Y3XHU1MjA2XHU5Njk0XG5cdGZvciAoY29uc3Qgd29yZCBvZiB0ZXh0LnNwbGl0KFxuXHRcdC9bIFx1MzAwMCxcdUZGMEMuXHUzMDAyXHUwMEI3XHUzMDAxXHUyMDI2XHVGRjFGP1wiXHUyMDFDXHUyMDFEKiZcXF4lXFwkI0AhXHVGRjAxXFwoXFwpXHVGRjA4XHVGRjA5XFw9XFwrX1x1MzAxMFx1MzAxMVxcW1xcXVxce1xcfVxcL3xdKy8sXG5cdCkpIHtcblx0XHRpZiAod29yZFJlZ2V4cC50ZXN0KHdvcmQpKSB7XG5cdFx0XHR3b3JkQ291bnQrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0d29yZENvdW50ICs9IHdvcmQubGVuZ3RoO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gKHdvcmRDb3VudCAvIDQwMCkgKiA2MCAqIDEwMDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkcmF3SW1hZ2VQcm9wKFxuXHRjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCxcblx0aW1nOiBIVE1MSW1hZ2VFbGVtZW50IHwgT2Zmc2NyZWVuQ2FudmFzLFxuXHR4ID0gMCxcblx0eSA9IDAsXG5cdHcgPSBjdHguY2FudmFzLndpZHRoLFxuXHRoID0gY3R4LmNhbnZhcy5oZWlnaHQsXG5cdG9mZnNldFggPSAwLjUsXG5cdG9mZnNldFkgPSAwLjUsXG4pIHtcblx0b2Zmc2V0WCA9IHR5cGVvZiBvZmZzZXRYID09PSBcIm51bWJlclwiID8gb2Zmc2V0WCA6IDAuNTtcblx0b2Zmc2V0WSA9IHR5cGVvZiBvZmZzZXRZID09PSBcIm51bWJlclwiID8gb2Zmc2V0WSA6IDAuNTtcblxuXHRpZiAob2Zmc2V0WCA8IDApIG9mZnNldFggPSAwO1xuXHRpZiAob2Zmc2V0WSA8IDApIG9mZnNldFkgPSAwO1xuXHRpZiAob2Zmc2V0WCA+IDEpIG9mZnNldFggPSAxO1xuXHRpZiAob2Zmc2V0WSA+IDEpIG9mZnNldFkgPSAxO1xuXG5cdHZhciBpdyA9IGltZy53aWR0aDtcblx0dmFyIGloID0gaW1nLmhlaWdodDtcblx0dmFyIHIgPSBNYXRoLm1pbih3IC8gaXcsIGggLyBpaCk7XG5cdHZhciBudyA9IGl3ICogcjtcblx0dmFyIG5oID0gaWggKiByO1xuXHR2YXIgY3g6IG51bWJlcjtcblx0dmFyIGN5OiBudW1iZXI7XG5cdHZhciBjdzogbnVtYmVyO1xuXHR2YXIgY2g6IG51bWJlcjtcblx0dmFyIGFyID0gMTtcblxuXHRpZiAobncgPCB3KSBhciA9IHcgLyBudztcblx0aWYgKE1hdGguYWJzKGFyIC0gMSkgPCAxZS0xNCAmJiBuaCA8IGgpIGFyID0gaCAvIG5oOyAvLyB1cGRhdGVkXG5cdG53ICo9IGFyO1xuXHRuaCAqPSBhcjtcblxuXHRjdyA9IGl3IC8gKG53IC8gdyk7XG5cdGNoID0gaWggLyAobmggLyBoKTtcblxuXHRjeCA9IChpdyAtIGN3KSAqIG9mZnNldFg7XG5cdGN5ID0gKGloIC0gY2gpICogb2Zmc2V0WTtcblxuXHRpZiAoY3ggPCAwKSBjeCA9IDA7XG5cdGlmIChjeSA8IDApIGN5ID0gMDtcblx0aWYgKGN3ID4gaXcpIGN3ID0gaXc7XG5cdGlmIChjaCA+IGloKSBjaCA9IGloO1xuXG5cdC8vIGZpbGwgaW1hZ2UgaW4gZGVzdC4gcmVjdGFuZ2xlXG5cdGN0eC5kcmF3SW1hZ2UoaW1nLCBjeCwgY3ksIGN3LCBjaCwgeCwgeSwgdywgaCk7XG59XG5cbmV4cG9ydCBjb25zdCBJU19XT1JLRVIgPVxuXHR0eXBlb2YgV29ya2VyR2xvYmFsU2NvcGUgIT09IFwidW5kZWZpbmVkXCIgJiYgc2VsZiBpbnN0YW5jZW9mIFdvcmtlckdsb2JhbFNjb3BlO1xuIiwgImltcG9ydCB7IElTX1dPUktFUiB9IGZyb20gXCIuL3V0aWxzXCI7XG5cbmNvbnN0IG5vb3AgPSAoKSA9PiB7fTtcblxuZXhwb3J0IGNvbnN0IGRiZyA9IChvYmopID0+IHtcblx0aWYgKERFQlVHKSB7XG5cdFx0aWYgKElTX1dPUktFUikge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZyhcIltBTUxMLVdvcmtlcl1cIiwgb2JqKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZyhvYmopO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb2JqO1xufTtcblxuZXhwb3J0IGNvbnN0IGRlYnVnID0gREVCVUdcblx0PyBJU19XT1JLRVJcblx0XHQ/ICguLi5hcmdzKSA9PiBjb25zb2xlLmRlYnVnKFwiW0FNTEwtV29ya2VyXVwiLCAuLi5hcmdzKVxuXHRcdDogY29uc29sZS5kZWJ1Z1xuXHQ6IG5vb3A7XG5cbmV4cG9ydCBjb25zdCBsb2cgPSBERUJVR1xuXHQ/IElTX1dPUktFUlxuXHRcdD8gKC4uLmFyZ3MpID0+IGNvbnNvbGUubG9nKFwiW0FNTEwtV29ya2VyXVwiLCAuLi5hcmdzKVxuXHRcdDogY29uc29sZS5sb2dcblx0OiBub29wO1xuXG5leHBvcnQgY29uc3Qgd2FybiA9IElTX1dPUktFUlxuXHQ/ICguLi5hcmdzKSA9PiBjb25zb2xlLndhcm4oXCJbQU1MTC1Xb3JrZXJdXCIsIC4uLmFyZ3MpXG5cdDogY29uc29sZS53YXJuO1xuXG5leHBvcnQgY29uc3QgZXJyb3IgPSBJU19XT1JLRVJcblx0PyAoLi4uYXJncykgPT4gY29uc29sZS5lcnJvcihcIltBTUxMLVdvcmtlcl1cIiwgLi4uYXJncylcblx0OiBjb25zb2xlLmVycm9yO1xuIiwgIntcbiAgICBcIm1hbmlmZXN0X3ZlcnNpb25cIjogMSxcbiAgICBcIm5hbWVcIjogXCJBcHBsZSBNdXNpYy1saWtlIGx5cmljc1wiLFxuICAgIFwic2x1Z1wiOiBcIkFwcGxlLU11c2ljbGlrZS1seXJpY3NcIixcbiAgICBcImF1dGhvclwiOiBcIlN0ZXZlWE1IXCIsXG4gICAgXCJhdXRob3JfbGlua3NcIjogW1xuICAgICAgICBcImh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZS14bWhcIixcbiAgICAgICAgXCJodHRwczovL2dpdGh1Yi5jb20vU3RldmUteG1oL2FwcGxlbXVzaWMtbGlrZS1seXJpY3NcIlxuICAgIF0sXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIlx1NEUwMFx1NEUyQVx1NTdGQVx1NEU4RSBCZXR0ZXJOQ00gXHU3Njg0XHU3QzdCIEFwcGxlIE11c2ljIFx1NkI0Q1x1OEJDRFx1NjYzRVx1NzkzQVx1NjNEMlx1NEVGNlwiLFxuICAgIFwicHJldmlld1wiOiBcInByZXZpZXcuc3ZnXCIsXG4gICAgXCJ2ZXJzaW9uXCI6IFwiMS42LjJcIixcbiAgICBcInR5cGVcIjogXCJleHRlbnNpb25cIixcbiAgICBcIm5vRGV2UmVsb2FkXCI6IHRydWUsXG4gICAgXCJyZXF1aXJlbWVudHNcIjogW10sXG4gICAgXCJpbmNvbXBhdGlibGVcIjogW10sXG4gICAgXCJiZXR0ZXJuY21fdmVyc2lvblwiOiBcIj49MS4wLjBcIixcbiAgICBcImluamVjdHNcIjoge1xuICAgICAgICBcIk1haW5cIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiZmlsZVwiOiBcImluZGV4LmpzXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgIH0sXG4gICAgXCJoaWphY2tzXCI6IHtcbiAgICAgICAgXCI+PSAyLjEwLjQgPD0gMi4xMC42XCI6IHtcbiAgICAgICAgICAgIFwib3JwaGV1czovL29ycGhldXMvcHViL2NvcmUuXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJyZXBsYWNlXCIsXG4gICAgICAgICAgICAgICAgXCJmcm9tXCI6IFwiPUZ1bmN0aW9uLnByb3RvdHlwZTtcIixcbiAgICAgICAgICAgICAgICBcInRvXCI6IFwiPXdpbmRvdy5GYWtlRnVuY3Rpb258fEZ1bmN0aW9uLnByb3RvdHlwZTtcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwib3JwaGV1czovL29ycGhldXMvcHViL2FwcC5odG1sXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJyZXBsYWNlXCIsXG4gICAgICAgICAgICAgICAgXCJmcm9tXCI6IFwiPG1ldGEgaHR0cC1lcXVpdj1cXFwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcXFwiIGNvbnRlbnQ9XFxcInNjcmlwdC1zcmMgXCIsXG4gICAgICAgICAgICAgICAgXCJ0b1wiOiBcIjxtZXRhIGh0dHAtZXF1aXY9XFxcIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XFxcIiBjb250ZW50PVxcXCJzY3JpcHQtc3JjIGRhdGE6IGJsb2I6IFwiXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59IiwgIi8qKlxuICogQGZpbGVvdmVydmlld1xuICogXHU4MUVBXHU1REYxXHU1MTk5XHU3Njg0XHU0RTAwXHU0RTJBXHU5MTREXHU3RjZFXHU1QjU4XHU1MEE4XHU2NUI5XHU2ODQ4XHVGRjBDQmV0dGVyTkNNIFx1NjNEMFx1NEY5Qlx1NzY4NFx1NEZERFx1NUI1OFx1NjVCOVx1NUYwRlx1NjAyN1x1ODBGRFx1NjM1Rlx1ODAxN1x1NjcwOVx1NzBCOVx1NTkyN1xuICogXHU5MTREXHU3RjZFXHU0RjFBXHU1MTQ4XHU4QkZCXHU1M0Q2XHU3MTM2XHU1NDBFXHU3RjEzXHU1QjU4XHVGRjBDXHU1MTk5XHU1MTY1XHU3Njg0XHU2NUY2XHU1MDE5XHU0RjFBXHU1MDVBXHU5NjMyXHU2Mjk2XHU1NDBFXHU1MThEXHU1MTk5XHU1MTY1XG4gKi9cblxuaW1wb3J0IHsgR0xPQkFMX0VWRU5UUyB9IGZyb20gXCIuLi9nbG9iYWwtZXZlbnRzXCI7XG5pbXBvcnQgeyB3YXJuIH0gZnJvbSBcIi4uL2xvZ2dlclwiO1xuaW1wb3J0IHsgZGVib3VuY2UsIElTX1dPUktFUiB9IGZyb20gXCIuLi91dGlsc1wiO1xuaW1wb3J0IHsgc2x1ZyB9IGZyb20gXCIuLi8uLi9tYW5pZmVzdC5qc29uXCI7XG5pbXBvcnQgeyBzZXRDb25maWdGcm9tTWFpbiB9IGZyb20gXCIuLi93b3JrZXJcIjtcblxuZXhwb3J0IGludGVyZmFjZSBDb25maWcge1xuXHRba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmNvbnN0IFBMVUdJTl9DT05GSUdfS0VZID0gYGNvbmZpZy5iZXR0ZXJuY20uJHtcblx0XCJwbHVnaW5cIiBpbiBnbG9iYWxUaGlzXG5cdFx0PyBwbHVnaW4/Lm1hbmlmZXN0Py5zbHVnIHx8IHBsdWdpbj8ubWFuaWZlc3Q/Lm5hbWUgfHwgc2x1Z1xuXHRcdDogc2x1Z1xufWA7XG5leHBvcnQgbGV0IEdMT0JBTF9DT05GSUc6IENvbmZpZyA9IGxvYWRDb25maWcoKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGxvYWRDb25maWcoKTogQ29uZmlnIHtcblx0aWYgKElTX1dPUktFUikge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKGxvY2FsU3RvcmFnZS5nZXRJdGVtKFBMVUdJTl9DT05GSUdfS0VZKSB8fCBcInt9XCIpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHR3YXJuKFwiXHU4QjY2XHU1NDRBXHVGRjFBQU1MTCBcdTYzRDJcdTRFRjZcdTkxNERcdTdGNkVcdThCRkJcdTUzRDZcdTU5MzFcdThEMjVcIiwgZXJyKTtcblx0XHRyZXR1cm4ge307XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bGxDb25maWcoKTogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdHJldHVybiBHTE9CQUxfQ09ORklHIHx8IHt9O1xufVxuXG5leHBvcnQgY29uc3Qgc2F2ZUNvbmZpZyA9IGRlYm91bmNlKGZ1bmN0aW9uIHNhdmVDb25maWcoKSB7XG5cdGlmIChJU19XT1JLRVIpIHtcblx0XHRHTE9CQUxfRVZFTlRTLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiY29uZmlnLXNhdmVkXCIpKTtcblx0XHRyZXR1cm47XG5cdH1cblx0dHJ5IHtcblx0XHRsb2NhbFN0b3JhZ2Uuc2V0SXRlbShQTFVHSU5fQ09ORklHX0tFWSwgSlNPTi5zdHJpbmdpZnkoR0xPQkFMX0NPTkZJRykpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHR3YXJuKFwiXHU4QjY2XHU1NDRBXHVGRjFBQU1MTCBcdTYzRDJcdTRFRjZcdTkxNERcdTdGNkVcdTRGRERcdTVCNThcdTU5MzFcdThEMjVcIiwgZXJyKTtcblx0fVxuXHRHTE9CQUxfRVZFTlRTLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KFwiY29uZmlnLXNhdmVkXCIpKTtcbn0sIDIwMDApO1xuXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29uZmlnKGtleTogc3RyaW5nLCB2YWx1ZT86IHN0cmluZykge1xuXHRpZiAoIUlTX1dPUktFUikgc2V0Q29uZmlnRnJvbU1haW4oeyBba2V5XTogdmFsdWUgfSk7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0Ly8gcm9tZS1pZ25vcmUgbGludC9wZXJmb3JtYW5jZS9ub0RlbGV0ZTogXHU5NjMyXHU2QjYyIEpTT04gXHU4RkQ4XHU2MjhBXHU1MTc2XHU1MTk5XHU1MTY1XHU5MTREXHU3RjZFXHU0RTJEXG5cdFx0ZGVsZXRlIEdMT0JBTF9DT05GSUdba2V5XTtcblx0fSBlbHNlIHtcblx0XHRHTE9CQUxfQ09ORklHW2tleV0gPSB2YWx1ZTtcblx0fVxuXHRzYXZlQ29uZmlnKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWcoa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogc3RyaW5nKTogc3RyaW5nO1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZyhcblx0a2V5OiBzdHJpbmcsXG5cdGRlZmF1bHRWYWx1ZT86IHN0cmluZyxcbik6IHN0cmluZyB8IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWcoa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IHN0cmluZykge1xuXHRpZiAoR0xPQkFMX0NPTkZJR1trZXldID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBHTE9CQUxfQ09ORklHW2tleV07XG5cdH1cbn1cbiIsICJ0eXBlIENvbXBhcmF0b3I8VD4gPSAoYTogVCwgYjogVCkgPT4gbnVtYmVyO1xuXG4vKipcbiAqIFx1NEYxOFx1NTE0OFx1OTYxRlx1NTIxN1xuICogXHU1M0VGXHU0RUU1XHU1NkZBXHU1QjlBXHU4QkJFXHU3RjZFXHU2MzkyXHU1RThGIENhbGxiYWNrIFx1NjVCOVx1NkNENVxuICovXG5leHBvcnQgY2xhc3MgUFF1ZXVlPFQ+IGV4dGVuZHMgQXJyYXk8VD4ge1xuXHRfc29ydGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIF9jb21wYXJhdG9yOiBDb21wYXJhdG9yPFQ+ID0gKGEsIGIpID0+IE51bWJlcihhKSAtIE51bWJlcihiKSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNvcnQgPSAoY29tcGFyYXRvcj86IENvbXBhcmF0b3I8VD4pID0+IHtcblx0XHR0aGlzLl9jb21wYXJhdG9yID0gY29tcGFyYXRvciA/IGNvbXBhcmF0b3IgOiB0aGlzLl9jb21wYXJhdG9yO1xuXHRcdHRoaXMuX3NvcnRlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHN1cGVyLnNvcnQodGhpcy5fY29tcGFyYXRvcik7XG5cdH07XG5cblx0cHVzaCA9IChvOiBUKSA9PiB7XG5cdFx0dGhpcy5fc29ydGVkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHN1cGVyLnB1c2gobyk7XG5cdH07XG5cblx0cG9wID0gKCkgPT4ge1xuXHRcdGlmICghdGhpcy5fc29ydGVkKSB0aGlzLnNvcnQoKTtcblx0XHRyZXR1cm4gc3VwZXIucG9wKCkgYXMgVDtcblx0fTtcblxuXHQvKipcblx0ICogXHU4M0I3XHU1M0Q2XHU0RTBCXHU2ODA3XHU1MTQzXHU3RDIwKFx1OUVEOFx1OEJBNFx1ODNCN1x1NTNENlx1NjcwMFx1NTQwRVx1NEUwMFx1NEY0RFx1NTE0M1x1N0QyMClcblx0ICogQHBhcmFtIGluZGV4XG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRwZWVrID0gKGluZGV4PzogbnVtYmVyKSA9PiB7XG5cdFx0aWYgKCF0aGlzLl9zb3J0ZWQpIHRoaXMuc29ydCgpO1xuXHRcdGlmIChpbmRleCA9PT0gdW5kZWZpbmVkKSBpbmRleCA9IHRoaXMubGVuZ3RoIC0gMTtcblx0XHRyZXR1cm4gdGhpc1tpbmRleF0gYXMgVDtcblx0fTtcblxuXHRzaXplID0gKCkgPT4ge1xuXHRcdHJldHVybiB0aGlzLmxlbmd0aDtcblx0fTtcblxuXHRkZWJ1ZyA9ICgpID0+IHtcblx0XHRpZiAoIXRoaXMuX3NvcnRlZCkgdGhpcy5zb3J0KCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59XG4iLCAiaW1wb3J0IHsgZ2V0Q29sb3JJbmRleCwgSGlzdG8sIFBpeGVsLCByc2hpZnQgfSBmcm9tIFwiLi91dGlsc1wiO1xuXG5leHBvcnQgdHlwZSBWQm94UmFuZ2VLZXkgPSBcInIxXCIgfCBcInIyXCIgfCBcImcxXCIgfCBcImcyXCIgfCBcImIxXCIgfCBcImIyXCI7XG4vKipcbiAqIHJnYlx1NEUwOVx1N0VGNFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNCBWQm94XG4gKiBcdTRFRTUgcixnLGIgXHU0RTA5XHU4MjcyXHU3Njg0XHU1M0Q2XHU4MjcyXHU4MzAzXHU1NkY0KDVcdTRGNEQpXHU1QjlBXHU0RTQ5IHZib3ggXHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0XHU1OTI3XHU1QzBGXG4gKiBcdTUzNzMgeCx5LHogXHU0RTA5XHU4Rjc0XHU3Njg0XHU0RTBBXHU0RTBCXHU5NjUwXHU1QjlBXHU0RTQ5IFx1N0E3QVx1OTVGNFx1NTkyN1x1NUMwRlxuICogaGl0c28gXHU0RTAwXHU3RUY0XHU2NTcwXHU3RUM0XHU0RkREXHU1QjU4XHU1MENGXHU3RDIwXHU4QkIwXHU1RjU1KFx1OTU3Rlx1NUVBNiA1KjUqNSlcbiAqL1xuZXhwb3J0IGNsYXNzIFZCb3gge1xuXHRwcml2YXRlIF9jb3VudDogbnVtYmVyID0gLTE7XG5cdHByaXZhdGUgX3ZvbHVtZTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfYXZnOiBQaXhlbCA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByMTogbnVtYmVyLCAvLyBtaW4gcmVkXG5cdFx0cHVibGljIHIyOiBudW1iZXIsIC8vIG1heCByZWRcblx0XHRwdWJsaWMgZzE6IG51bWJlcixcblx0XHRwdWJsaWMgZzI6IG51bWJlcixcblx0XHRwdWJsaWMgYjE6IG51bWJlcixcblx0XHRwdWJsaWMgYjI6IG51bWJlcixcblx0XHRwdWJsaWMgaGlzdG86IEhpc3RvLFxuXHQpIHt9XG5cblx0LyoqXG5cdCAqIFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1NEY1M1x1NzlFRlx1RkYwOFx1NTM3MyByLGcsYiBcdTRFMDlcdTdFRjRcdTk1N0ZcdTY1QjlcdTRGNTNcdTRGNTNcdTc5RUZcdUZGMDlcblx0ICogQHBhcmFtIGZvcmNlIFx1NUYzQVx1NTIzNlx1OTFDRFx1N0I5N1xuXHQgKiBAcmV0dXJuc1xuXHQgKi9cblx0dm9sdW1lID0gKGZvcmNlPzogYm9vbGVhbikgPT4ge1xuXHRcdGlmICh0aGlzLl92b2x1bWUgJiYgIWZvcmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdm9sdW1lO1xuXHRcdH1cblx0XHR0aGlzLl92b2x1bWUgPVxuXHRcdFx0KHRoaXMucjIgLSB0aGlzLnIxICsgMSkgKlxuXHRcdFx0KHRoaXMuZzIgLSB0aGlzLmcxICsgMSkgKlxuXHRcdFx0KHRoaXMuYjIgLSB0aGlzLmIxICsgMSk7XG5cdFx0cmV0dXJuIHRoaXMuX3ZvbHVtZTtcblx0fTtcblxuXHQvKipcblx0ICogXHU4M0I3XHU1M0Q2IHZib3ggXHU1MTg1XHU3Njg0XHU2MDNCXHU1MENGXHU3RDIwXHU2NTcwXG5cdCAqIEBwYXJhbSBmb3JjZSBcdTVGM0FcdTUyMzZcdTkxQ0RcdTdCOTdcblx0ICogQHJldHVybnNcblx0ICovXG5cdGNvdW50ID0gKGZvcmNlPzogYm9vbGVhbikgPT4ge1xuXHRcdGlmICh0aGlzLl9jb3VudCA+IC0xICYmICFmb3JjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvdW50O1xuXHRcdH1cblxuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0bGV0IGk6IG51bWJlcjtcblx0XHRsZXQgajogbnVtYmVyO1xuXHRcdGxldCBrOiBudW1iZXI7XG5cdFx0bGV0IGluZGV4OiBudW1iZXI7XG5cdFx0Zm9yIChpID0gdGhpcy5yMTsgaSA8PSB0aGlzLnIyOyBpKyspIHtcblx0XHRcdGZvciAoaiA9IHRoaXMuZzE7IGogPD0gdGhpcy5nMjsgaisrKSB7XG5cdFx0XHRcdGZvciAoayA9IHRoaXMuYjE7IGsgPD0gdGhpcy5iMjsgaysrKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBnZXRDb2xvckluZGV4KGksIGosIGspO1xuXHRcdFx0XHRcdGNvdW50ICs9IHRoaXMuaGlzdG9baW5kZXhdIHx8IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fY291bnQgPSBjb3VudDtcblx0XHRyZXR1cm4gdGhpcy5fY291bnQ7XG5cdH07XG5cblx0Y29weSA9ICgpID0+IHtcblx0XHRyZXR1cm4gbmV3IFZCb3goXG5cdFx0XHR0aGlzLnIxLFxuXHRcdFx0dGhpcy5yMixcblx0XHRcdHRoaXMuZzEsXG5cdFx0XHR0aGlzLmcyLFxuXHRcdFx0dGhpcy5iMSxcblx0XHRcdHRoaXMuYjIsXG5cdFx0XHR0aGlzLmhpc3RvLFxuXHRcdCk7XG5cdH07XG5cblx0LyoqXG5cdCAqIFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1NUU3M1x1NTc0N1x1OTg5Q1x1ODI3MlxuXHQgKiBAcGFyYW0gZm9yY2Vcblx0ICogQHJldHVybnNcblx0ICovXG5cdGF2ZyA9IChmb3JjZT86IGJvb2xlYW4pID0+IHtcblx0XHRpZiAodGhpcy5fYXZnLmxlbmd0aCAmJiBmb3JjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2F2Zztcblx0XHR9XG5cdFx0bGV0IG50b3QgPSAwO1xuXHRcdGxldCBtdWx0ID0gMSA8PCByc2hpZnQ7XG5cdFx0bGV0IHJzdW0gPSAwO1xuXHRcdGxldCBnc3VtID0gMDtcblx0XHRsZXQgYnN1bSA9IDA7XG5cdFx0bGV0IGh2YWw6IG51bWJlcjtcblx0XHRsZXQgaTogbnVtYmVyO1xuXHRcdGxldCBqOiBudW1iZXI7XG5cdFx0bGV0IGs6IG51bWJlcjtcblx0XHRsZXQgaGlzdG9pbmRleDogbnVtYmVyO1xuXHRcdGZvciAoaSA9IHRoaXMucjE7IGkgPD0gdGhpcy5yMjsgaSsrKSB7XG5cdFx0XHRmb3IgKGogPSB0aGlzLmcxOyBqIDw9IHRoaXMuZzI7IGorKykge1xuXHRcdFx0XHRmb3IgKGsgPSB0aGlzLmIxOyBrIDw9IHRoaXMuYjI7IGsrKykge1xuXHRcdFx0XHRcdGhpc3RvaW5kZXggPSBnZXRDb2xvckluZGV4KGksIGosIGspO1xuXHRcdFx0XHRcdGh2YWwgPSB0aGlzLmhpc3RvW2hpc3RvaW5kZXhdIHx8IDA7XG5cdFx0XHRcdFx0bnRvdCArPSBodmFsO1xuXHRcdFx0XHRcdHJzdW0gKz0gaHZhbCAqIChpICsgMC41KSAqIG11bHQ7XG5cdFx0XHRcdFx0Z3N1bSArPSBodmFsICogKGogKyAwLjUpICogbXVsdDtcblx0XHRcdFx0XHRic3VtICs9IGh2YWwgKiAoayArIDAuNSkgKiBtdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChudG90KSB7XG5cdFx0XHR0aGlzLl9hdmcgPSBbfn4ocnN1bSAvIG50b3QpLCB+fihnc3VtIC8gbnRvdCksIH5+KGJzdW0gLyBudG90KV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVtcHR5IGJveFxuXHRcdFx0dGhpcy5fYXZnID0gW1xuXHRcdFx0XHR+figobXVsdCAqICh0aGlzLnIxICsgdGhpcy5yMiArIDEpKSAvIDIpLFxuXHRcdFx0XHR+figobXVsdCAqICh0aGlzLmcxICsgdGhpcy5nMiArIDEpKSAvIDIpLFxuXHRcdFx0XHR+figobXVsdCAqICh0aGlzLmIxICsgdGhpcy5iMiArIDEpKSAvIDIpLFxuXHRcdFx0XTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2F2Zztcblx0fTtcblxuXHQvKipcblx0ICogXHU1MENGXHU3RDIwXHU2NjJGXHU1NDI2XHU1NzI4dmJveFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1NTE4NVxuXHQgKiBAcGFyYW0gcGl4ZWxcblx0ICogQHJldHVybnNcblx0ICovXG5cdGNvbnRhaW5zID0gKHBpeGVsOiBudW1iZXJbXSkgPT4ge1xuXHRcdGNvbnN0IFtydmFsLCBndmFsLCBidmFsXSA9IHBpeGVsLm1hcCgobnVtKSA9PiBudW0gPj4gcnNoaWZ0KTtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cnZhbCA+PSB0aGlzLnIxICYmXG5cdFx0XHRydmFsIDw9IHRoaXMucjIgJiZcblx0XHRcdGd2YWwgPj0gdGhpcy5nMSAmJlxuXHRcdFx0Z3ZhbCA8PSB0aGlzLmcyICYmXG5cdFx0XHRidmFsID49IHRoaXMuYjEgJiZcblx0XHRcdGJ2YWwgPD0gdGhpcy5iMlxuXHRcdCk7XG5cdH07XG59XG4iLCAiaW1wb3J0IHsgVkJveCwgVkJveFJhbmdlS2V5IH0gZnJvbSBcIi4vdi1ib3hcIjtcblxuZXhwb3J0IHR5cGUgUGl4ZWwgPSBudW1iZXJbXTsgLy8gW3JlZCAsZ3JlZW4sIGJsdWVdIFx1NTBDRlx1N0QyMFx1NjU3MFx1N0VDNFxuZXhwb3J0IHR5cGUgSGlzdG8gPSBudW1iZXJbXTsgLy8gXHU4QkIwXHU1RjU1XHU1MENGXHU3RDIwXHU2NTcwXHU5MUNGXHU2NTcwXHU3RUM0XHVGRjA4XHU0RTBCXHU2ODA3XHU2ODM5XHU2MzZFIHJnYiBcdTY1NzBcdTUwM0NcdThGRDBcdTdCOTdcdTVGOTdcdUZGMDlcblxuZXhwb3J0IGNvbnN0IHNpZ2JpdHMgPSA1O1xuZXhwb3J0IGNvbnN0IHJzaGlmdCA9IDggLSBzaWdiaXRzO1xuZXhwb3J0IGNvbnN0IG1heEl0ZXJhdGlvbnMgPSAxMDAwO1xuZXhwb3J0IGNvbnN0IGZyYWN0QnlQb3B1bGF0aW9ucyA9IDAuNzU7XG5cbmV4cG9ydCBjb25zdCBwdiA9IHtcblx0bmF0dXJhbE9yZGVyOiA8VD4oYTogVCwgYjogVCkgPT4ge1xuXHRcdHJldHVybiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMDtcblx0fSxcblx0c3VtOiA8VD4oYXJyYXk6IFRbXSwgZj86ICh0OiBUKSA9PiBudW1iZXIpID0+IHtcblx0XHRyZXR1cm4gYXJyYXkucmVkdWNlKChwLCB0KSA9PiB7XG5cdFx0XHRyZXR1cm4gcCArIChmID8gZi5jYWxsKGFycmF5LCB0KSA6IE51bWJlcih0KSk7XG5cdFx0fSwgMCk7XG5cdH0sXG5cdG1heDogPFQ+KGFycmF5OiBUW10sIGY/OiAoZDogVCkgPT4gbnVtYmVyKSA9PiB7XG5cdFx0cmV0dXJuIE1hdGgubWF4LmFwcGx5KG51bGwsIGYgPyBhcnJheS5tYXAoZikgOiBhcnJheS5tYXAoKGQpID0+IE51bWJlcihkKSkpO1xuXHR9LFxuXHRzaXplOiA8VD4oYXJyYXk6IFRbXSkgPT4ge1xuXHRcdHJldHVybiBhcnJheS5yZWR1Y2UoKHAsIHQpID0+ICh0ID8gcCArIDEgOiBwKSwgMCk7XG5cdH0sXG59O1xuXG4vKipcbiAqIFx1ODNCN1x1NTNENltyZWcsIGdyZWVuLCBibHVlXVx1OTg5Q1x1ODI3Mlx1N0E3QVx1OTVGNFx1NTBDRlx1N0QyMFx1NUJGOVx1NUU5NFx1NzY4NCBoaXN0byBcdTRFMEJcdTY4MDdcbiAqIGhpc3RvWzAwMDAwIDAwMDAwIDAwMDAwXVxuICogQHJldHVybnMgaW5kZXhcbiAqL1xuZXhwb3J0IGNvbnN0IGdldENvbG9ySW5kZXggPSAocjogbnVtYmVyLCBnOiBudW1iZXIsIGI6IG51bWJlcikgPT4ge1xuXHRyZXR1cm4gKHIgPDwgKDIgKiBzaWdiaXRzKSkgKyAoZyA8PCBzaWdiaXRzKSArIGI7XG59O1xuXG4vKipcbiAqIFx1OTAxQVx1OEZDN1x1NjU3MFx1N0VDNCBbcmVnLCBncmVlbiwgYmx1ZV0gXHU4M0I3XHU1M0Q2XHU4QkU1XHU1MENGXHU3RDIwXHU1NzI4IGhpc3RvIFx1NEUwQlx1NjgwN1xuICogaGlzdG9cdTZCQ0ZcdTRFMkFcdTUxNDNcdTdEMjBcdTRGRERcdTVCNTggXHU1QkY5XHU1RTk0XHU5ODlDXHU4MjcyXHU3QTdBXHU5NUY0XHU1MENGXHU3RDIwIFx1NzY4NFx1NjU3MFx1OTFDRlxuICogQHBhcmFtIHBpeGVsc1xuICogQHJldHVybnMgaGlzdG9cbiAqL1xuZXhwb3J0IGNvbnN0IGdldEhpc3RvID0gKHBpeGVsczogUGl4ZWxbXSk6IEhpc3RvID0+IHtcblx0bGV0IGhpc3RvID0gbmV3IEFycmF5PG51bWJlcj4oMSA8PCAoMyAqIHNpZ2JpdHMpKTtcblx0bGV0IGluZGV4OiBudW1iZXI7XG5cdGxldCBydmFsOiBudW1iZXI7XG5cdGxldCBndmFsOiBudW1iZXI7XG5cdGxldCBidmFsOiBudW1iZXI7XG5cdHBpeGVscy5mb3JFYWNoKChwaXhlbCkgPT4ge1xuXHRcdFtydmFsLCBndmFsLCBidmFsXSA9IHBpeGVsLm1hcCgobnVtKSA9PiBudW0gPj4gcnNoaWZ0KTtcblx0XHRpbmRleCA9IGdldENvbG9ySW5kZXgocnZhbCwgZ3ZhbCwgYnZhbCk7IC8vIFx1ODNCN1x1NTNENlx1OEJFNVx1OTg5Q1x1ODI3Mlx1N0E3QVx1OTVGNFx1NTBDRlx1N0QyMFx1NUJGOVx1NUU5NFx1NzY4NCBoaXN0byBcdTRFMEJcdTY4MDdcblx0XHRoaXN0b1tpbmRleF0gPSAoaGlzdG9baW5kZXhdIHx8IDApICsgMTtcblx0fSk7XG5cdHJldHVybiBoaXN0bztcbn07XG5cbi8qKlxuICogXHU2ODM5XHU2MzZFXHU1MENGXHU3RDIwXHU0RkUxXHU2MDZGIFtyZWcsIGdyZWVuLCBibHVlXVtdIFx1NTIwNlx1NTIyQlx1ODNCN1x1NTNENiByZ2IgXHU3Njg0XHU2NzAwXHU1MDNDXHVGRjBDXHU0RUU1XHU1M0NBXHU4QkU1XHU1MENGXHU3RDIwXHU2NTcwXHU5MUNGXG4gKiBAcGFyYW0gcGl4ZWxzXG4gKiBAcmV0dXJuc1xuICoge1xuICogIGhpc3RvOiBcdTRFMDBcdTdFRjRcdTY1NzBcdTdFQzRcdUZGMENcdTdFRDlcdTUxRkFcdTk4OUNcdTgyNzJcdTdBN0FcdTk1RjRcdTZCQ0ZcdTRFMkFcdTkxQ0ZcdTUzMTZcdTUzM0FcdTU3REZcdTc2ODRcdTUwQ0ZcdTdEMjBcdTY1NzBcbiAqICB2Ym94OiBcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjRcdTRGNTNcbiAqIH1cbiAqL1xuZXhwb3J0IGNvbnN0IGdldEhpc3RvQW5kVkJveCA9IChwaXhlbHM6IFBpeGVsW10pID0+IHtcblx0Ly8gXHU0RTAwXHU3RUY0XHU4MjcyXHU1RjY5XHU4MzAzXHU1NkY0XHU2NTcwXHU3RUM0XG5cdGxldCBoaXN0byA9IG5ldyBBcnJheTxudW1iZXI+KDEgPDwgKDMgKiBzaWdiaXRzKSk7XG5cdGxldCBpbmRleDogbnVtYmVyO1xuXHQvLyBcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjRcdTgzMDNcdTU2RjRcblx0bGV0IHJtaW4gPSBJbmZpbml0eTtcblx0bGV0IHJtYXggPSAwO1xuXHRsZXQgZ21pbiA9IEluZmluaXR5O1xuXHRsZXQgZ21heCA9IDA7XG5cdGxldCBibWluID0gSW5maW5pdHk7XG5cdGxldCBibWF4ID0gMDtcblx0Ly8gcixnLGJcdTUzOEJcdTdGMjlcdTUwM0Ncblx0bGV0IHJ2YWw6IG51bWJlcjtcblx0bGV0IGd2YWw6IG51bWJlcjtcblx0bGV0IGJ2YWw6IG51bWJlcjtcblx0Ly8gXHU2NkY0XHU2NUIwIGhpc3RvICYmIGZpbmQgbWluL21heCwgXHU2ODM5XHU2MzZFXHU2NzAwXHU1MDNDXHU3NTFGXHU2MjEwXHU3QjI2XHU1NDA4XHU4QkU1XHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0XHU3Njg0IHZib3hcblx0cGl4ZWxzLmZvckVhY2goZnVuY3Rpb24gKHBpeGVsKSB7XG5cdFx0W3J2YWwsIGd2YWwsIGJ2YWxdID0gcGl4ZWwubWFwKChudW0pID0+IG51bSA+PiByc2hpZnQpO1xuXG5cdFx0aW5kZXggPSBnZXRDb2xvckluZGV4KHJ2YWwsIGd2YWwsIGJ2YWwpOyAvLyBcdTgzQjdcdTUzRDZcdThCRTVcdTk4OUNcdTgyNzJcdTdBN0FcdTk1RjRcdTUwQ0ZcdTdEMjBcdTVCRjlcdTVFOTRcdTc2ODQgaGlzdG8gXHU0RTBCXHU2ODA3XG5cdFx0aGlzdG9baW5kZXhdID0gKGhpc3RvW2luZGV4XSB8fCAwKSArIDE7XG5cblx0XHRpZiAocnZhbCA8IHJtaW4pIHJtaW4gPSBydmFsO1xuXHRcdGVsc2UgaWYgKHJ2YWwgPiBybWF4KSBybWF4ID0gcnZhbDtcblx0XHRpZiAoZ3ZhbCA8IGdtaW4pIGdtaW4gPSBndmFsO1xuXHRcdGVsc2UgaWYgKGd2YWwgPiBnbWF4KSBnbWF4ID0gZ3ZhbDtcblx0XHRpZiAoYnZhbCA8IGJtaW4pIGJtaW4gPSBidmFsO1xuXHRcdGVsc2UgaWYgKGJ2YWwgPiBibWF4KSBibWF4ID0gYnZhbDtcblx0fSk7XG5cdHJldHVybiB7XG5cdFx0dmJveDogbmV3IFZCb3gocm1pbiwgcm1heCwgZ21pbiwgZ21heCwgYm1pbiwgYm1heCwgaGlzdG8pLFxuXHRcdGhpc3RvLFxuXHR9O1xufTtcblxuLyoqXG4gKiBcdTY4MzlcdTYzNkVcdTY3MDBcdTk1N0ZcdThGQjlcdTUyMDdcdTUyMDZcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjRcdTk1N0ZcdTY1QjlcdTRGNTMgdmJveFxuICogMS4gXHU2MjdFXHU1MjMwIHZib3ggXHU2NzAwXHU5NTdGXHU4RkI5IGxcbiAqIDIuIFx1NjI3RVx1NTIzMCBsIFx1OEZCOVx1NEUwQVx1NEUyRFx1NEY0RFx1NjU3MFx1NEUwQlx1NjgwN1xuICogMy4gXHU2ODM5XHU2MzZFXHU0RTJEXHU0RjREXHU2NTcwXHU1MjA3XHU1MjA2XHU3QTdBXHU5NUY0XHU1QkM2XHU1RUE2XHU4RjgzXHU1OTI3XHU3Njg0IHZib3hcbiAqIEBwYXJhbSBoaXN0b1xuICogQHBhcmFtIHZib3hcbiAqIEByZXR1cm5zXG4gKi9cbmV4cG9ydCBjb25zdCBtZWRpYW5DdXRBcHBseSA9IChoaXN0bzogSGlzdG8sIHZib3g6IFZCb3gpOiBWQm94W10gPT4ge1xuXHQvLyBubyBwaXhlbCwgcmV0dXJuXG5cdGlmICghdmJveC5jb3VudCgpKSByZXR1cm4gW107XG5cdC8vIG9ubHkgb25lIHBpeGVsLCBubyBzcGxpdFxuXHRpZiAodmJveC5jb3VudCgpID09PSAxKSB7XG5cdFx0cmV0dXJuIFt2Ym94LmNvcHkoKV07XG5cdH1cblxuXHRjb25zdCBydyA9IHZib3gucjIgLSB2Ym94LnIxICsgMTtcblx0Y29uc3QgZ3cgPSB2Ym94LmcyIC0gdmJveC5nMSArIDE7XG5cdGNvbnN0IGJ3ID0gdmJveC5iMiAtIHZib3guYjEgKyAxO1xuXHRjb25zdCBtYXh3ID0gcHYubWF4KFtydywgZ3csIGJ3XSk7XG5cdGNvbnN0IHBhcnRpYWxzdW06IG51bWJlcltdID0gW107XG5cblx0bGV0IHRvdGFsID0gMDtcblx0bGV0IGk6IG51bWJlcjtcblx0bGV0IGo6IG51bWJlcjtcblx0bGV0IGs6IG51bWJlcjtcblx0bGV0IHN1bTogbnVtYmVyO1xuXHRsZXQgaW5kZXg6IG51bWJlcjtcblxuXHQvLyBcdTY4MzlcdTYzNkVcdTRFMDlcdTgyNzJcdThGNzRcdTgzQjdcdTUzRDZcdThCRTVcdThGNzRcdTUwQ0ZcdTdEMjBcdTY1NzBcdTkxQ0Zcblx0aWYgKG1heHcgPT09IHJ3KSB7XG5cdFx0Zm9yIChpID0gdmJveC5yMTsgaSA8PSB2Ym94LnIyOyBpKyspIHtcblx0XHRcdHN1bSA9IDA7XG5cdFx0XHRmb3IgKGogPSB2Ym94LmcxOyBqIDw9IHZib3guZzI7IGorKykge1xuXHRcdFx0XHRmb3IgKGsgPSB2Ym94LmIxOyBrIDw9IHZib3guYjI7IGsrKykge1xuXHRcdFx0XHRcdGluZGV4ID0gZ2V0Q29sb3JJbmRleChpLCBqLCBrKTtcblx0XHRcdFx0XHRzdW0gKz0gaGlzdG9baW5kZXhdIHx8IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRvdGFsICs9IHN1bTtcblx0XHRcdHBhcnRpYWxzdW1baV0gPSB0b3RhbDtcblx0XHR9XG5cdH0gZWxzZSBpZiAobWF4dyA9PT0gZ3cpIHtcblx0XHRmb3IgKGkgPSB2Ym94LmcxOyBpIDw9IHZib3guZzI7IGkrKykge1xuXHRcdFx0c3VtID0gMDtcblx0XHRcdGZvciAoaiA9IHZib3gucjE7IGogPD0gdmJveC5yMjsgaisrKSB7XG5cdFx0XHRcdGZvciAoayA9IHZib3guYjE7IGsgPD0gdmJveC5iMjsgaysrKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBnZXRDb2xvckluZGV4KGosIGksIGspO1xuXHRcdFx0XHRcdHN1bSArPSBoaXN0b1tpbmRleF0gfHwgMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dG90YWwgKz0gc3VtO1xuXHRcdFx0cGFydGlhbHN1bVtpXSA9IHRvdGFsO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRmb3IgKGkgPSB2Ym94LmIxOyBpIDw9IHZib3guYjI7IGkrKykge1xuXHRcdFx0c3VtID0gMDtcblx0XHRcdGZvciAoaiA9IHZib3gucjE7IGogPD0gdmJveC5yMjsgaisrKSB7XG5cdFx0XHRcdGZvciAoayA9IHZib3guZzE7IGsgPD0gdmJveC5nMjsgaysrKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBnZXRDb2xvckluZGV4KGosIGssIGkpO1xuXHRcdFx0XHRcdHN1bSArPSBoaXN0b1tpbmRleF0gfHwgMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dG90YWwgKz0gc3VtO1xuXHRcdFx0cGFydGlhbHN1bVtpXSA9IHRvdGFsO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBcdTY4MzlcdTYzNkVcdTk4OUNcdTgyNzJcdTdFRjRcdTVFQTZcdTgzQjdcdTUzRDZcdTRFMkRcdTRGNERcdTY1NzBcdUZGMENcdTVFNzZcdTUyMDdcdTUyMDZ2Ym94XG5cdCAqIEBwYXJhbSBjb2xvciBcdTk4OUNcdTgyNzJcdTdFRjRcdTVFQTZcblx0ICogQHJldHVybnNcblx0ICovXG5cdGNvbnN0IGRvQ3V0ID0gKGNvbG9yOiBcInJcIiB8IFwiZ1wiIHwgXCJiXCIpID0+IHtcblx0XHRjb25zdCBkaW0xID0gYCR7Y29sb3J9MWAgYXMgVkJveFJhbmdlS2V5O1xuXHRcdGNvbnN0IGRpbTIgPSBgJHtjb2xvcn0yYCBhcyBWQm94UmFuZ2VLZXk7XG5cdFx0bGV0IGxlZnQ6IG51bWJlcjtcblx0XHRsZXQgcmlnaHQ6IG51bWJlcjtcblx0XHRsZXQgdmJveDE6IFZCb3g7XG5cdFx0bGV0IHZib3gyOiBWQm94O1xuXHRcdGxldCBjdXRJbmRleDogbnVtYmVyO1xuXG5cdFx0Zm9yIChpID0gdmJveFtkaW0xXTsgaSA8PSB2Ym94W2RpbTJdOyBpKyspIHtcblx0XHRcdGlmIChwYXJ0aWFsc3VtW2ldID49IHRvdGFsIC8gMikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2Ym94MSA9IHZib3guY29weSgpO1xuXHRcdHZib3gyID0gdmJveC5jb3B5KCk7XG5cdFx0Ly8gXHU0RTJEXHU0RjREXHU2NTcwXHU0RTBCXHU2ODA3XHU0RTBFXHU4QkU1XHU4Rjc0XHU0RTBBXHU0RTBCXHU5NjUwXHU0RTBCXHU2ODA3XHU3Njg0XHU4REREXHU3OUJCXHVGRjBDXHU4REREXHU3OUJCXHU4RDhBXHU3N0VEXHU1MzczXHU3QTdBXHU5NUY0XHU1QkM2XHU1RUE2XHU4RDhBXHU1OTI3XG5cdFx0bGVmdCA9IGkgLSB2Ym94W2RpbTFdO1xuXHRcdHJpZ2h0ID0gdmJveFtkaW0yXSAtIGk7XG5cdFx0Ly8gXHU4M0I3XHU1M0Q2XHU1MjA3XHU1MjA2XHU3MEI5XG5cdFx0Y3V0SW5kZXggPVxuXHRcdFx0bGVmdCA8PSByaWdodFxuXHRcdFx0XHQ/IE1hdGgubWluKHZib3hbZGltMl0gLSAxLCB+fihpICsgcmlnaHQgLyAyKSlcblx0XHRcdFx0OiBNYXRoLm1heCh2Ym94W2RpbTFdLCB+fihpIC0gMSAtIGxlZnQgLyAyKSk7XG5cdFx0Ly8gYXZvaWQgMC1jb3VudCBib3hlc1xuXHRcdHdoaWxlICghcGFydGlhbHN1bVtjdXRJbmRleF0gJiYgY3V0SW5kZXggPD0gdmJveFtkaW0yXSkgY3V0SW5kZXgrKztcblx0XHQvLyBzZXQgZGltZW5zaW9uc1xuXHRcdHZib3gxW2RpbTJdID0gY3V0SW5kZXg7XG5cdFx0dmJveDJbZGltMV0gPSBjdXRJbmRleCArIDE7XG5cblx0XHRyZXR1cm4gW3Zib3gxLCB2Ym94Ml07XG5cdH07XG5cblx0Ly8gZGV0ZXJtaW5lIHRoZSBjdXQgcGxhbmVzXG5cdHJldHVybiBtYXh3ID09PSBydyA/IGRvQ3V0KFwiclwiKSA6IG1heHcgPT09IGd3ID8gZG9DdXQoXCJnXCIpIDogZG9DdXQoXCJiXCIpO1xufTtcbiIsICJpbXBvcnQgeyBQUXVldWUgfSBmcm9tIFwiLi9wLXF1ZXVlXCI7XG5pbXBvcnQgeyBQaXhlbCwgcHYgfSBmcm9tIFwiLi91dGlsc1wiO1xuaW1wb3J0IHsgVkJveCB9IGZyb20gXCIuL3YtYm94XCI7XG5cbnR5cGUgVkJveEl0ZW0gPSB7XG5cdHZib3g6IFZCb3g7XG5cdGNvbG9yOiBQaXhlbDtcbn07XG5cbmV4cG9ydCBjbGFzcyBDTWFwIHtcblx0LyoqXG5cdCAqIFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNCBcdTlFRDhcdThCQTRcdTZCRDRcdThGODNcdTUxRkRcdTY1NzBcblx0ICovXG5cdHN0YXRpYyBfY29tcGFyZSA9IChhOiBWQm94SXRlbSwgYjogVkJveEl0ZW0pID0+IHtcblx0XHRyZXR1cm4gcHYubmF0dXJhbE9yZGVyKFxuXHRcdFx0YS52Ym94LmNvdW50KCkgKiBhLnZib3gudm9sdW1lKCksXG5cdFx0XHRiLnZib3guY291bnQoKSAqIGIudmJveC52b2x1bWUoKSxcblx0XHQpO1xuXHR9O1xuXHQvKipcblx0ICogXHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0XHU5NjFGXHU1MjE3XHVGRjBDXHU0RUU1IENNYXAuX2NvbXBhcmUgXHU2MzkyXHU1RThGXG5cdCAqL1xuXHR2Ym94ZXM6IFBRdWV1ZTxWQm94SXRlbT47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy52Ym94ZXMgPSBuZXcgUFF1ZXVlPFZCb3hJdGVtPihDTWFwLl9jb21wYXJlKTtcblx0fVxuXG5cdHB1c2ggPSAodmJveDogVkJveCkgPT4ge1xuXHRcdHRoaXMudmJveGVzLnB1c2goe1xuXHRcdFx0dmJveDogdmJveCxcblx0XHRcdGNvbG9yOiB2Ym94LmF2ZygpLCAvLyBcdTY4MzlcdTYzNkVcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjRcdTVFNzNcdTU3NDdcdTgyNzJcdTUzRDYgXHU4RkQxXHU0RjNDXHU4MjcyXG5cdFx0fSk7XG5cdH07XG5cblx0LyoqXG5cdCAqIFx1ODNCN1x1NTNENlx1NjI0MFx1NjcwOVx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1OTg5Q1x1ODI3MlxuXHQgKiBAcmV0dXJuc1xuXHQgKi9cblx0cGFsZXR0ZSA9ICgpID0+IHtcblx0XHRyZXR1cm4gdGhpcy52Ym94ZXMubWFwKCh2YikgPT4gdmIuY29sb3IpO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjRzaXplXG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRzaXplID0gKCkgPT4ge1xuXHRcdHJldHVybiB0aGlzLnZib3hlcy5zaXplKCk7XG5cdH07XG5cblx0LyoqXG5cdCAqIFx1NTMzOVx1OTE0RFx1NUY1M1x1NTI0RFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1OEZEMVx1NEYzQ1x1NTAzQ1xuXHQgKiBAcGFyYW0gY29sb3Jcblx0ICogQHJldHVybnNcblx0ICovXG5cdG1hcCA9IChjb2xvcjogUGl4ZWwpID0+IHtcblx0XHQvLyBcdTVGNTNcdTUyNERcdTY3MDlcdTgyNzJcdTVGNjlcdTdBN0FcdTk1RjQgXHU1MzA1XHU2MkVDXHU1MzM5XHU5MTREXHU1MDNDXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnZib3hlcy5zaXplKCk7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMudmJveGVzLnBlZWsoaSkudmJveC5jb250YWlucyhjb2xvcikpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudmJveGVzLnBlZWsoaSkuY29sb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFx1NjVFMFx1NTMzOVx1OTE0RFx1RkYwQ1x1NTNENlx1OEZEMVx1NEYzQ1x1NTAzQ1xuXHRcdHJldHVybiB0aGlzLm5lYXJlc3QoY29sb3IpO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBcdTgzQjdcdTUzRDZcdTVGNTNcdTUyNERcdTk4OUNcdTgyNzJcdThGRDFcdTRGM0NcdTUwM0Ncblx0ICogQHBhcmFtIGNvbG9yXG5cdCAqIEByZXR1cm5zXG5cdCAqL1xuXHRuZWFyZXN0ID0gKGNvbG9yOiBQaXhlbCkgPT4ge1xuXHRcdGxldCBpLCBkMSwgZDIsIHBDb2xvcjtcblx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy52Ym94ZXMuc2l6ZSgpOyBpKyspIHtcblx0XHRcdGQyID0gTWF0aC5zcXJ0KFxuXHRcdFx0XHRNYXRoLnBvdyhjb2xvclswXSAtIHRoaXMudmJveGVzLnBlZWsoaSkuY29sb3JbMF0sIDIpICtcblx0XHRcdFx0XHRNYXRoLnBvdyhjb2xvclsxXSAtIHRoaXMudmJveGVzLnBlZWsoaSkuY29sb3JbMV0sIDIpICtcblx0XHRcdFx0XHRNYXRoLnBvdyhjb2xvclsyXSAtIHRoaXMudmJveGVzLnBlZWsoaSkuY29sb3JbMl0sIDIpLFxuXHRcdFx0KTtcblx0XHRcdGlmIChkMSA9PT0gdW5kZWZpbmVkIHx8IGQyIDwgZDEpIHtcblx0XHRcdFx0ZDEgPSBkMjtcblx0XHRcdFx0cENvbG9yID0gdGhpcy52Ym94ZXMucGVlayhpKS5jb2xvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBDb2xvcjtcblx0fTtcblxuXHQvKipcblx0ICogXHU1RjUzXHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0XHU2M0E1XHU4RkQxXHU2NzgxXHU1MDNDXHU2NUY2XHVGRjBDXHU3NkY0XHU2M0E1XHU1M0Q2XHU3RUFGXHU5RUQxXHU3NjdEXHU4MjcyXG5cdCAqL1xuXHRmb3JjZWJ3ID0gKCkgPT4ge1xuXHRcdC8vIFx1NEVFNSByZ2IgXHU0RTA5XHU4MjcyXHU3QTdBXHU5NUY0XHU3RUREXHU1QkY5XHU1MDNDXHU2MzkyXHU1RThGXG5cdFx0dGhpcy52Ym94ZXMuc29ydCgoYTogVkJveEl0ZW0sIGI6IFZCb3hJdGVtKSA9PiB7XG5cdFx0XHRyZXR1cm4gcHYubmF0dXJhbE9yZGVyKHB2LnN1bShhLmNvbG9yKSwgcHYuc3VtKGIuY29sb3IpKTtcblx0XHR9KTtcblxuXHRcdC8vIGZvcmNlIGRhcmtlc3QgY29sb3IgdG8gYmxhY2sgaWYgZXZlcnl0aGluZyA8IDVcblx0XHRjb25zdCBsb3dlc3QgPSB0aGlzLnZib3hlc1swXS5jb2xvcjtcblx0XHRpZiAobG93ZXN0WzBdIDwgNSAmJiBsb3dlc3RbMV0gPCA1ICYmIGxvd2VzdFsyXSA8IDUpXG5cdFx0XHR0aGlzLnZib3hlc1swXS5jb2xvciA9IFswLCAwLCAwXTtcblxuXHRcdC8vIGZvcmNlIGxpZ2h0ZXN0IGNvbG9yIHRvIHdoaXRlIGlmIGV2ZXJ5dGhpbmcgPiAyNTFcblx0XHRjb25zdCBpZHggPSB0aGlzLnZib3hlcy5sZW5ndGggLSAxLFxuXHRcdFx0aGlnaGVzdCA9IHRoaXMudmJveGVzW2lkeF0uY29sb3I7XG5cdFx0aWYgKGhpZ2hlc3RbMF0gPiAyNTEgJiYgaGlnaGVzdFsxXSA+IDI1MSAmJiBoaWdoZXN0WzJdID4gMjUxKVxuXHRcdFx0dGhpcy52Ym94ZXNbaWR4XS5jb2xvciA9IFsyNTUsIDI1NSwgMjU1XTtcblxuXHRcdHRoaXMudmJveGVzLnNvcnQoQ01hcC5fY29tcGFyZSk7XG5cdH07XG59XG4iLCAiLyoqXG4gKiBCYXNpYyBKYXZhc2NyaXB0IHBvcnQgb2YgdGhlIE1NQ1EgKG1vZGlmaWVkIG1lZGlhbiBjdXQgcXVhbnRpemF0aW9uKVxuICogYWxnb3JpdGhtIGZyb20gdGhlIExlcHRvbmljYSBsaWJyYXJ5IChodHRwOi8vd3d3LmxlcHRvbmljYS5vcmcvKS5cbiAqIFJldHVybnMgYSBjb2xvciBtYXAgeW91IGNhbiB1c2UgdG8gbWFwIG9yaWdpbmFsIHBpeGVscyB0byB0aGUgcmVkdWNlZFxuICogcGFsZXR0ZS4gU3RpbGwgYSB3b3JrIGluIHByb2dyZXNzLlxuICovXG5cbmltcG9ydCB7IENNYXAgfSBmcm9tIFwiLi9jLW1hcFwiO1xuaW1wb3J0IHsgUFF1ZXVlIH0gZnJvbSBcIi4vcC1xdWV1ZVwiO1xuaW1wb3J0IHtcblx0ZnJhY3RCeVBvcHVsYXRpb25zLFxuXHRnZXRIaXN0b0FuZFZCb3gsXG5cdG1heEl0ZXJhdGlvbnMsXG5cdG1lZGlhbkN1dEFwcGx5LFxuXHRQaXhlbCxcblx0cHYsXG59IGZyb20gXCIuL3V0aWxzXCI7XG5pbXBvcnQgeyBWQm94IH0gZnJvbSBcIi4vdi1ib3hcIjtcblxuZXhwb3J0IGNvbnN0IHF1YW50aXplID0gKHBpeGVsczogUGl4ZWxbXSwgbWF4Y29sb3JzOiBudW1iZXIpID0+IHtcblx0aWYgKCFwaXhlbHMubGVuZ3RoIHx8IG1heGNvbG9ycyA8IDEgfHwgbWF4Y29sb3JzID4gMjU2KSB7XG5cdFx0cmV0dXJuIG5ldyBDTWFwKCk7XG5cdH1cblxuXHQvLyBcdTVDMDYgUkdCIFx1NEUwOVx1N0VGNFx1ODI3Mlx1NUY2OVx1NjU3MFx1N0VDNCBcdThGNkNcdTRFM0EgaGlzdG8gXHU0RTAwXHU3RUY0XHU2NTcwXHU3RUM0XHVGRjA4XHU0RjFBXHU1MDVBXHU0RTAwXHU1QjlBXHU1MzhCXHU3RjI5XHU1OTA0XHU3NDA2XHVGRjA5XG5cdC8vIFx1NjgzOVx1NjM2RVx1NTM5RiByZ2IgXHU1MENGXHU3RDIwXHU2NTcwXHU3RUM0XHU4M0I3XHU1M0Q2XHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0IHZib3hcdUZGMDhyLCBnLCBiXHU0RTA5XHU4MjcyXHU3Njg0XHU4MzAzXHU1NkY0XHVGRjA5XG5cdGNvbnN0IHsgaGlzdG8sIHZib3ggfSA9IGdldEhpc3RvQW5kVkJveChwaXhlbHMpO1xuXG5cdC8vIHZib3ggXHU0RjE4XHU1MTQ4XHU5NjFGXHU1MjE3XHVGRjBDXHU0RUU1XHU1QzVFXHU0RThFXHU4QkU1IHZib3ggXHU3Njg0XHU1MENGXHU3RDIwXHU2NTcwXHU5MUNGIGNvdW50IFx1NjM5Mlx1NUU4RlxuXHRjb25zdCBwcSA9IG5ldyBQUXVldWU8VkJveD4oKGEsIGIpID0+IHtcblx0XHRyZXR1cm4gcHYubmF0dXJhbE9yZGVyKGEuY291bnQoKSwgYi5jb3VudCgpKTtcblx0fSk7XG5cdHBxLnB1c2godmJveCk7XG5cblx0Ly8gXHU1QzA2IHZib3ggXHU5NjFGXHU1MjE3XHU2MjY5XHU1QzU1XHU1MjMwIHRhcmdldCBcdTc2RUVcdTY4MDdcdTk1N0ZcdTVFQTZcblx0Ly8gXHU1NkUwXHU0RTNBXHU2NjJGXHU0RjE4XHU1MTQ4XHU5NjFGXHU1MjE3XHVGRjBDXHU2MjQwXHU0RUU1XHU2QkNGXHU0RTAwXHU2QjIxXHU5MEZEXHU2MkM2XHU1MjA2IHBvcCBcdTc2ODRcdTdCMkNcdTRFMDBcdTRFMkFcdUZGMDhcdTUzNzNcdTUwQ0ZcdTdEMjBcdTY1NzBcdTY3MDBcdTU5MUFcdTc2ODRcdTRFMDBcdTRFMkFcdUZGMDl2Ym94XG5cdGNvbnN0IGl0ZXIgPSAodmJveFF1ZXVlOiBQUXVldWU8VkJveD4sIHRhcmdldDogbnVtYmVyKSA9PiB7XG5cdFx0bGV0IHZib3hTaXplID0gdmJveFF1ZXVlLnNpemUoKTtcblx0XHRsZXQgdGVtcEl0ZXJhdGlvbnMgPSAwO1xuXHRcdGxldCB2Ym94OiBWQm94O1xuXG5cdFx0d2hpbGUgKHRlbXBJdGVyYXRpb25zIDwgbWF4SXRlcmF0aW9ucykge1xuXHRcdFx0Ly8gXHU2RUUxXHU4REIzXHU2NTcwXHU5MUNGXHU5NzAwXHU2QzQyXG5cdFx0XHRpZiAodmJveFNpemUgPj0gdGFyZ2V0KSByZXR1cm47XG5cdFx0XHQvLyBcdTkwNERcdTUzODZcdTZCMjFcdTY1NzBcdThGQzdcdTU5MUFcblx0XHRcdGlmICh0ZW1wSXRlcmF0aW9ucysrID4gbWF4SXRlcmF0aW9ucykgcmV0dXJuO1xuXHRcdFx0Ly8gXHU5NjFGXHU1MjE3XHU5ODc2XHU5MEU4IHZib3ggXHU2NUUwXHU1MENGXHU3RDIwXG5cdFx0XHRpZiAoIXZib3hRdWV1ZS5wZWVrKCkuY291bnQoKSkgcmV0dXJuO1xuXG5cdFx0XHR2Ym94ID0gdmJveFF1ZXVlLnBvcCgpO1xuXHRcdFx0Ly8gZG8gdGhlIGN1dFxuXHRcdFx0Y29uc3QgW3Zib3gxLCB2Ym94Ml0gPSBtZWRpYW5DdXRBcHBseShoaXN0bywgdmJveCk7XG5cblx0XHRcdGlmICghdmJveDEpIHtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coXCJ2Ym94MSBub3QgZGVmaW5lZDsgc2hvdWxkbid0IGhhcHBlbiFcIik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHZib3hRdWV1ZS5wdXNoKHZib3gxKTtcblx0XHRcdGlmICh2Ym94Mikge1xuXHRcdFx0XHQvKiB2Ym94MiBjYW4gYmUgbnVsbCAqL1xuXHRcdFx0XHR2Ym94UXVldWUucHVzaCh2Ym94Mik7XG5cdFx0XHRcdHZib3hTaXplKys7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdC8vIFx1N0IyQ1x1NEUwMFx1NkIyMVx1NTIwNlx1NTI3MiB2Ym94ZXMgXHVGRjBDXHU2MzA5XHU3MTY3XHVGRjA4XHU1MENGXHU3RDIwXHU5MUNGXHVGRjA5XHU4RkRCXHU4ODRDXHU3Qzk3XHU1MjA2XG5cdGl0ZXIocHEsIGZyYWN0QnlQb3B1bGF0aW9ucyAqIG1heGNvbG9ycyk7XG5cblx0Ly8gXHU2MzA5KFx1NTBDRlx1N0QyMFx1OTFDRiAqIFx1ODI3Mlx1NUY2OVx1N0E3QVx1OTVGNFx1NEY1M1x1NzlFRilcdTkxQ0RcdTY1QjBcdTYzOTJcdTVFOEZcblx0cHEuc29ydCgoYSwgYikgPT4ge1xuXHRcdHJldHVybiBwdi5uYXR1cmFsT3JkZXIoYS5jb3VudCgpICogYS52b2x1bWUoKSwgYi5jb3VudCgpICogYi52b2x1bWUoKSk7XG5cdH0pO1xuXG5cdC8vIFx1N0IyQ1x1NEU4Q1x1NkIyMVx1NTIwNlx1NTI3Mlx1RkYwQ1x1NEY3Rlx1NzUyOCAoXHU1MENGXHU3RDIwXHU5MUNGICogXHU4MjcyXHU1RjY5XHU3QTdBXHU5NUY0XHU0RjUzXHU3OUVGKSBcdTYzOTJcdTVFOEZcdTc1MUZcdTYyMTBcdTRFMkRcdTRGNERcdTY1NzBcdTUyMDdcdTUyNzIuXG5cdGl0ZXIocHEsIG1heGNvbG9ycyk7XG5cblx0Ly8gXHU5MDREXHU1Mzg2IHBxXHVGRjBDXHU2NkY0XHU2NUIwIHZib3ggXHU0RTJEIGF2ZyBjb2xvclxuXHRjb25zdCBjbWFwID0gbmV3IENNYXAoKTtcblx0d2hpbGUgKHBxLnNpemUoKSkge1xuXHRcdGNtYXAucHVzaChwcS5wb3AoKSk7XG5cdH1cblxuXHRyZXR1cm4gY21hcDtcbn07XG4iLCAiaW1wb3J0IHsgQ29uZmlnLCBHTE9CQUxfQ09ORklHLCBzZXRDb25maWcgfSBmcm9tIFwiLi4vY29uZmlnL2NvcmVcIjtcbmltcG9ydCB7IGxvZywgd2FybiB9IGZyb20gXCIuLi9sb2dnZXJcIjtcbmltcG9ydCB7IElTX1dPUktFUiwgZ2VuUmFuZG9tU3RyaW5nIH0gZnJvbSBcIi4uL3V0aWxzXCI7XG5pbXBvcnQgeyBxdWFudGl6ZSB9IGZyb20gXCIuL2NvbG9yLXF1YW50aXplXCI7XG5pbXBvcnQgeyBQaXhlbCB9IGZyb20gXCIuL2NvbG9yLXF1YW50aXplL3V0aWxzXCI7XG5leHBvcnQgbGV0IHdvcmtlcjogV29ya2VyIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgbGV0IGN1cnJlbnRXb3JrZXJTY3JpcHQgPSBcIlwiO1xubGV0IHdvcmtlckJsb2I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiByZXN0YXJ0V29ya2VyKHdvcmtlclNjcmlwdCA9IGN1cnJlbnRXb3JrZXJTY3JpcHQpIHtcblx0Y3VycmVudFdvcmtlclNjcmlwdCA9IHdvcmtlclNjcmlwdDtcblx0aWYgKHdvcmtlckJsb2IpIHtcblx0XHRVUkwucmV2b2tlT2JqZWN0VVJMKHdvcmtlckJsb2IpO1xuXHR9XG5cdHdvcmtlckJsb2IgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKFxuXHRcdG5ldyBCbG9iKFt3b3JrZXJTY3JpcHRdLCB7XG5cdFx0XHR0eXBlOiBcImFwcGxpY2F0aW9uL2phdmFzY3JpcHRcIixcblx0XHR9KSxcblx0KTtcblx0d29ya2VyPy5yZW1vdmVFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBvbk1haW5NZXNzYWdlKTtcblx0d29ya2VyPy50ZXJtaW5hdGUoKTtcblx0d29ya2VyID0gbmV3IFdvcmtlcih3b3JrZXJCbG9iLCB7XG5cdFx0bmFtZTogXCJBTUxMIFdvcmtlclwiLFxuXHRcdHR5cGU6IFwiY2xhc3NpY1wiLFxuXHR9KTtcblx0c2V0Q29uZmlnRnJvbU1haW4oR0xPQkFMX0NPTkZJRyk7XG5cdHdvcmtlci5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCBvbk1haW5NZXNzYWdlKTtcbn1cblxuZXhwb3J0IGNvbnN0IGRlZmluZWRGdW5jdGlvbnM6IHtcblx0W2Z1bmNOYW1lOiBzdHJpbmddOiB7XG5cdFx0ZnVuY05hbWU6IHN0cmluZztcblx0XHRmdW5jQm9keTogRnVuY3Rpb247XG5cdH07XG59ID0ge307XG5jb25zdCBjYWxsYmFja3MgPSBuZXcgTWFwPHN0cmluZywgW0Z1bmN0aW9uLCBGdW5jdGlvbl0+KCk7XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVXb3JrZXJGdW5jdGlvbjxBcmdzIGV4dGVuZHMgYW55W10sIFJldD4oXG5cdGZ1bmNOYW1lOiBzdHJpbmcsXG5cdGZ1bmNCb2R5OiAoLi4uYXJnczogQXJncykgPT4gUmV0LFxuXHR0cmFuc2ZlckFyZ0luZGV4ZXM6IG51bWJlcltdID0gW10sXG4pOiAoLi4uYXJnczogQXJncykgPT4gUHJvbWlzZTxSZXQ+IHtcblx0ZGVmaW5lZEZ1bmN0aW9uc1tmdW5jTmFtZV0gPSB7XG5cdFx0ZnVuY05hbWUsXG5cdFx0ZnVuY0JvZHksXG5cdH07XG5cdGxldCBjYWxsSWQgPSAwO1xuXHRyZXR1cm4gKC4uLmFyZ3M6IEFyZ3MpID0+IHtcblx0XHRpZiAod29ya2VyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZCA9IGAke2dlblJhbmRvbVN0cmluZyg0KX0gLSAke2Z1bmNOYW1lfSAtICR7Y2FsbElkKyt9YDtcblx0XHRcdFx0Y2FsbGJhY2tzLnNldChpZCwgW3Jlc29sdmUsIHJlamVjdF0pO1xuXHRcdFx0XHR3b3JrZXIhIS5wb3N0TWVzc2FnZShcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdGZ1bmNOYW1lLFxuXHRcdFx0XHRcdFx0YXJncyxcblx0XHRcdFx0XHR9IGFzIFdvcmtlckNhbGxNZXNzYWdlLFxuXHRcdFx0XHRcdHRyYW5zZmVyQXJnSW5kZXhlcy5tYXAoKGkpID0+IGFyZ3NbaV0pLmZpbHRlcigodikgPT4gISF2KSxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBXb3JrZXIgXHU1QzFBXHU2NzJBXHU4RkQwXHU4ODRDXHVGRjBDXHU1NzI4XHU2NzJDXHU1NzMwXHU3RUJGXHU3QTBCXHU2MjY3XHU4ODRDXG5cdFx0XHR3YXJuKFwiQU1MTCBXb3JrZXIgXHU1QzFBXHU2NzJBXHU4RkQwXHU4ODRDXHVGRjBDXHU2QjYzXHU1NzI4XHU2NzJDXHU1NzMwXHU3RUJGXHU3QTBCXHU2MjY3XHU4ODRDXHU1MUZEXHU2NTcwXCIsIGZ1bmNOYW1lLCBhcmdzKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZ1bmNCb2R5KC4uLmFyZ3MpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtlckNhbGxNZXNzYWdlIHtcblx0aWQ6IHN0cmluZztcblx0ZnVuY05hbWU6IHN0cmluZztcblx0YXJnczogdW5rbm93bltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFdvcmtlclJlc3VsdE1lc3NhZ2Uge1xuXHRpZDogc3RyaW5nO1xuXHRyZXN1bHQ6IHVua25vd247XG5cdGVycm9yPzogRXJyb3I7XG59XG5leHBvcnQgY29uc3QgZ3JhYkltYWdlQ29sb3JzID0gZGVmaW5lV29ya2VyRnVuY3Rpb24oXG5cdFwiZ3JhYkltYWdlQ29sb3JzXCIsXG5cdGFzeW5jIChpbWc6IEltYWdlQml0bWFwLCBtYXhDb2xvcnMgPSAxNikgPT4ge1xuXHRcdGNvbnN0IGNhbnZhcyA9IG5ldyBPZmZzY3JlZW5DYW52YXMoaW1nLndpZHRoLCBpbWcuaGVpZ2h0KTtcblx0XHRjb25zdCBjdHg6IE9mZnNjcmVlbkNhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCA9IGNhbnZhcy5nZXRDb250ZXh0KFxuXHRcdFx0XCIyZFwiLFxuXHRcdCkgYXMgdW5rbm93biBhcyBPZmZzY3JlZW5DYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XG5cdFx0aWYgKGN0eCkge1xuXHRcdFx0Y3R4LmRyYXdJbWFnZShpbWcsIDAsIDApO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGN0eC5nZXRJbWFnZURhdGEoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcblx0XHRcdGNvbnN0IHBpeGVsczogUGl4ZWxbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBkYXRhLndpZHRoICogZGF0YS5oZWlnaHQ7IGkrKykge1xuXHRcdFx0XHRwaXhlbHMucHVzaChbXG5cdFx0XHRcdFx0ZGF0YS5kYXRhW2kgKiA0XSxcblx0XHRcdFx0XHRkYXRhLmRhdGFbaSAqIDQgKyAxXSxcblx0XHRcdFx0XHRkYXRhLmRhdGFbaSAqIDQgKyAyXSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBxdWFudGl6ZShwaXhlbHMsIG1heENvbG9ycyk7XG5cdFx0XHRjb25zdCBjb2xvcnM6IFBpeGVsW10gPSBbXTtcblx0XHRcdHJlc3VsdC5wYWxldHRlKCkuZm9yRWFjaCgoY29sb3IpID0+IGNvbG9ycy5wdXNoKGNvbG9yKSk7XG5cdFx0XHRyZXR1cm4gY29sb3JzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9LFxuKTtcblxuZXhwb3J0IGNvbnN0IHNldENvbmZpZ0Zyb21NYWluID0gZGVmaW5lV29ya2VyRnVuY3Rpb24oXG5cdFwic2V0Q29uZmlnRnJvbU1haW5cIixcblx0KGNvbmZpZzogUGFydGlhbDxDb25maWc+KSA9PiB7XG5cdFx0aWYgKElTX1dPUktFUikge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gY29uZmlnKSB7XG5cdFx0XHRcdHNldENvbmZpZyhrZXksIGNvbmZpZ1trZXldKTtcblx0XHRcdH1cblx0XHRcdGxvZyhcIlx1NURGMlx1NEVDRVx1NEUzQlx1N0VCRlx1N0EwQlx1NTQwQ1x1NkI2NVx1OTE0RFx1N0Y2RVwiLCAuLi5PYmplY3Qua2V5cyhjb25maWcpKTtcblx0XHR9XG5cdH0sXG4pO1xuXG5leHBvcnQgZnVuY3Rpb24gb25NYWluTWVzc2FnZShldnQ6IE1lc3NhZ2VFdmVudDxXb3JrZXJSZXN1bHRNZXNzYWdlPikge1xuXHRjb25zdCBkYXRhID0gY2FsbGJhY2tzLmdldChldnQuZGF0YS5pZCk7XG5cdGlmIChkYXRhKSB7XG5cdFx0Y29uc3QgW3Jlc29sdmUsIHJlamVjdF0gPSBkYXRhO1xuXHRcdGNhbGxiYWNrcy5kZWxldGUoZXZ0LmRhdGEuaWQpO1xuXHRcdGlmIChldnQuZGF0YS5lcnJvcikge1xuXHRcdFx0cmVqZWN0KGV2dC5kYXRhLmVycm9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb2x2ZShldnQuZGF0YS5yZXN1bHQpO1xuXHRcdH1cblx0fVxufVxuIiwgImltcG9ydCBcIi4vd29ya2VyL2luZGV4XCI7XG5pbXBvcnQgeyBlcnJvciwgbG9nIH0gZnJvbSBcIi4vbG9nZ2VyXCI7XG5pbXBvcnQge1xuXHRkZWZpbmVkRnVuY3Rpb25zLFxuXHRXb3JrZXJDYWxsTWVzc2FnZSxcblx0V29ya2VyUmVzdWx0TWVzc2FnZSxcbn0gZnJvbSBcIi4vd29ya2VyL2luZGV4XCI7XG5cbm9ubWVzc2FnZSA9IGFzeW5jIChldnQ6IE1lc3NhZ2VFdmVudDxXb3JrZXJDYWxsTWVzc2FnZT4pID0+IHtcblx0dHJ5IHtcblx0XHRsb2coXCJcdTZCNjNcdTU3MjhcdTYyNjdcdTg4NENcdTU0MEVcdTUzRjBcdTRFRkJcdTUyQTFcIiwgZXZ0LmRhdGEuaWQsIGV2dC5kYXRhLmZ1bmNOYW1lLCBldnQuZGF0YS5hcmdzKTtcblx0XHRjb25zdCByZXQgPSBkZWZpbmVkRnVuY3Rpb25zW2V2dC5kYXRhLmZ1bmNOYW1lXS5mdW5jQm9keSguLi5ldnQuZGF0YS5hcmdzKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXQ7XG5cdFx0cG9zdE1lc3NhZ2Uoe1xuXHRcdFx0aWQ6IGV2dC5kYXRhLmlkLFxuXHRcdFx0cmVzdWx0OiByZXN1bHQsXG5cdFx0fSBhcyBXb3JrZXJSZXN1bHRNZXNzYWdlKTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0ZXJyb3IoXG5cdFx0XHRcIlx1NTQwRVx1NTNGMFx1NEVGQlx1NTJBMVx1NTNEMVx1NzUxRlx1OTUxOVx1OEJFRlwiLFxuXHRcdFx0ZXZ0LmRhdGEuaWQsXG5cdFx0XHRldnQuZGF0YS5mdW5jTmFtZSxcblx0XHRcdGV2dC5kYXRhLmFyZ3MsXG5cdFx0XHRlcnIsXG5cdFx0KTtcblx0XHRwb3N0TWVzc2FnZSh7XG5cdFx0XHRpZDogZXZ0LmRhdGEuaWQsXG5cdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHRcdGVycm9yOiBlcnIsXG5cdFx0fSBhcyBXb3JrZXJSZXN1bHRNZXNzYWdlKTtcblx0fVxufTtcblxubG9nKFwiQU1MTCBcdTU0MEVcdTUzRjBcdTdFQkZcdTdBMEJcdTZCNjNcdTU3MjhcdThGRDBcdTg4NENcdUZGMDFcIik7XG4iXSwKICAibWFwcGluZ3MiOiAiOztBQUFPLE1BQU0sZ0JBQWdCLElBQUksWUFBWTs7O0FDQXRDLFdBQVMsU0FBNkIsVUFBYSxVQUFxQjtBQUM5RSxRQUFJLFFBQVE7QUFDWixXQUFPLFNBQVMsa0JBQWtCO0FBQ2pDLFlBQU1BLFFBQU87QUFFYixZQUFNLE9BQU87QUFDYixVQUFJLE9BQU87QUFDVixxQkFBYSxLQUFLO0FBQUEsTUFDbkI7QUFDQSxjQUFRLFdBQVcsU0FBUyxLQUFLQSxPQUFNLElBQUksR0FBRyxRQUFRO0FBQUEsSUFDdkQ7QUFBQSxFQUNEO0FBNEhPLFdBQVMsZ0JBQWdCLFFBQWdCO0FBQy9DLFVBQU0sUUFBUTtBQUNkLFVBQU0sU0FBbUIsQ0FBQztBQUMxQixhQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsS0FBSztBQUNoQyxhQUFPLEtBQUssTUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLE9BQU8sSUFBSSxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDbkU7QUFDQSxXQUFPLE9BQU8sS0FBSyxFQUFFO0FBQUEsRUFDdEI7QUFvRU8sTUFBTSxZQUNaLE9BQU8sc0JBQXNCLGVBQWUsZ0JBQWdCOzs7QUM5THRELE1BQU0sTUFBTSxPQUNoQixZQUNDLElBQUksU0FBUyxRQUFRLElBQUksaUJBQWlCLEdBQUcsSUFBSSxJQUNqRCxRQUFRLE1BQ1Q7QUFFSSxNQUFNLE9BQU8sWUFDakIsSUFBSSxTQUFTLFFBQVEsS0FBSyxpQkFBaUIsR0FBRyxJQUFJLElBQ2xELFFBQVE7QUFFSixNQUFNLFFBQVEsWUFDbEIsSUFBSSxTQUFTLFFBQVEsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLElBQ25ELFFBQVE7OztBQzlCUCxhQUFROzs7QUNIWjtBQWdCQSxNQUFNLG9CQUFvQixvQkFDekIsWUFBWSxlQUNULHNDQUFRLGFBQVIsbUJBQWtCLFdBQVEsc0NBQVEsYUFBUixtQkFBa0IsU0FBUSxPQUNwRDtBQUVHLE1BQUksZ0JBQXdCLFdBQVc7QUFFdkMsV0FBUyxhQUFxQjtBQUNwQyxRQUFJLFdBQVc7QUFDZCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsUUFBSTtBQUNILGFBQU8sS0FBSyxNQUFNLGFBQWEsUUFBUSxpQkFBaUIsS0FBSyxJQUFJO0FBQUEsSUFDbEUsU0FBUyxLQUFQO0FBQ0QsV0FBSywyRUFBb0IsR0FBRztBQUM1QixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQU1PLE1BQU0sYUFBYSxTQUFTLFNBQVNDLGNBQWE7QUFDeEQsUUFBSSxXQUFXO0FBQ2Qsb0JBQWMsY0FBYyxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQ3JEO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxtQkFBYSxRQUFRLG1CQUFtQixLQUFLLFVBQVUsYUFBYSxDQUFDO0FBQUEsSUFDdEUsU0FBUyxLQUFQO0FBQ0QsV0FBSywyRUFBb0IsR0FBRztBQUFBLElBQzdCO0FBQ0Esa0JBQWMsY0FBYyxJQUFJLE1BQU0sY0FBYyxDQUFDO0FBQUEsRUFDdEQsR0FBRyxHQUFJO0FBRUEsV0FBUyxVQUFVLEtBQWEsT0FBZ0I7QUFDdEQsUUFBSSxDQUFDO0FBQVcsd0JBQWtCLEVBQUUsQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDO0FBQ2xELFFBQUksVUFBVSxRQUFXO0FBRXhCLGFBQU8sY0FBYyxHQUFHO0FBQUEsSUFDekIsT0FBTztBQUNOLG9CQUFjLEdBQUcsSUFBSTtBQUFBLElBQ3RCO0FBQ0EsZUFBVztBQUFBLEVBQ1o7OztBQ3ZETyxNQUFNLFNBQU4sY0FBd0IsTUFBUztBQUFBLElBR3ZDLFlBQ1csY0FBNkIsQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksT0FBTyxDQUFDLEdBQ3BFO0FBQ0QsWUFBTTtBQUZJO0FBSFgscUJBQW1CO0FBUW5CLGtCQUFPLENBQUMsZUFBK0I7QUFDdEMsYUFBSyxjQUFjLGFBQWEsYUFBYSxLQUFLO0FBQ2xELGFBQUssVUFBVTtBQUNmLGVBQU8sTUFBTSxLQUFLLEtBQUssV0FBVztBQUFBLE1BQ25DO0FBRUEsa0JBQU8sQ0FBQyxNQUFTO0FBQ2hCLGFBQUssVUFBVTtBQUNmLGVBQU8sTUFBTSxLQUFLLENBQUM7QUFBQSxNQUNwQjtBQUVBLGlCQUFNLE1BQU07QUFDWCxZQUFJLENBQUMsS0FBSztBQUFTLGVBQUssS0FBSztBQUM3QixlQUFPLE1BQU0sSUFBSTtBQUFBLE1BQ2xCO0FBT0E7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGtCQUFPLENBQUMsVUFBbUI7QUFDMUIsWUFBSSxDQUFDLEtBQUs7QUFBUyxlQUFLLEtBQUs7QUFDN0IsWUFBSSxVQUFVO0FBQVcsa0JBQVEsS0FBSyxTQUFTO0FBQy9DLGVBQU8sS0FBSyxLQUFLO0FBQUEsTUFDbEI7QUFFQSxrQkFBTyxNQUFNO0FBQ1osZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUVBLG1CQUFRLE1BQU07QUFDYixZQUFJLENBQUMsS0FBSztBQUFTLGVBQUssS0FBSztBQUM3QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBcENBO0FBQUEsRUFxQ0Q7OztBQ3pDTyxNQUFNLE9BQU4sTUFBVztBQUFBLElBS2pCLFlBQ1EsSUFDQSxJQUNBLElBQ0EsSUFDQSxJQUNBLElBQ0EsT0FDTjtBQVBNO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBWFIsV0FBUSxTQUFpQjtBQUN6QixXQUFRLFVBQWtCO0FBQzFCLFdBQVEsT0FBYyxDQUFDO0FBaUJ2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsb0JBQVMsQ0FBQyxVQUFvQjtBQUM3QixZQUFJLEtBQUssV0FBVyxDQUFDLE9BQU87QUFDM0IsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFDQSxhQUFLLFdBQ0gsS0FBSyxLQUFLLEtBQUssS0FBSyxNQUNwQixLQUFLLEtBQUssS0FBSyxLQUFLLE1BQ3BCLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDdEIsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQU9BO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxtQkFBUSxDQUFDLFVBQW9CO0FBQzVCLFlBQUksS0FBSyxTQUFTLE1BQU0sQ0FBQyxPQUFPO0FBQy9CLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBRUEsWUFBSSxRQUFRO0FBQ1osWUFBSTtBQUNKLFlBQUk7QUFDSixZQUFJO0FBQ0osWUFBSTtBQUNKLGFBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUNwQyxlQUFLLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDcEMsaUJBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUNwQyxzQkFBUSxjQUFjLEdBQUcsR0FBRyxDQUFDO0FBQzdCLHVCQUFTLEtBQUssTUFBTSxLQUFLLEtBQUs7QUFBQSxZQUMvQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQ0EsYUFBSyxTQUFTO0FBQ2QsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUVBLGtCQUFPLE1BQU07QUFDWixlQUFPLElBQUk7QUFBQSxVQUNWLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxRQUNOO0FBQUEsTUFDRDtBQU9BO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxpQkFBTSxDQUFDLFVBQW9CO0FBQzFCLFlBQUksS0FBSyxLQUFLLFVBQVUsT0FBTztBQUM5QixpQkFBTyxLQUFLO0FBQUEsUUFDYjtBQUNBLFlBQUksT0FBTztBQUNYLFlBQUksT0FBTyxLQUFLO0FBQ2hCLFlBQUksT0FBTztBQUNYLFlBQUksT0FBTztBQUNYLFlBQUksT0FBTztBQUNYLFlBQUk7QUFDSixZQUFJO0FBQ0osWUFBSTtBQUNKLFlBQUk7QUFDSixZQUFJO0FBQ0osYUFBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLGVBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUNwQyxpQkFBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLDJCQUFhLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDbEMscUJBQU8sS0FBSyxNQUFNLFVBQVUsS0FBSztBQUNqQyxzQkFBUTtBQUNSLHNCQUFRLFFBQVEsSUFBSSxPQUFPO0FBQzNCLHNCQUFRLFFBQVEsSUFBSSxPQUFPO0FBQzNCLHNCQUFRLFFBQVEsSUFBSSxPQUFPO0FBQUEsWUFDNUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLFlBQUksTUFBTTtBQUNULGVBQUssT0FBTyxDQUFDLENBQUMsRUFBRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLE9BQU8sT0FBTyxDQUFDLEVBQUUsT0FBTyxLQUFLO0FBQUEsUUFDL0QsT0FBTztBQUVOLGVBQUssT0FBTztBQUFBLFlBQ1gsQ0FBQyxFQUFHLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFNO0FBQUEsWUFDdEMsQ0FBQyxFQUFHLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFNO0FBQUEsWUFDdEMsQ0FBQyxFQUFHLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFNO0FBQUEsVUFDdkM7QUFBQSxRQUNEO0FBQ0EsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQU9BO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFBVyxDQUFDLFVBQW9CO0FBQy9CLGNBQU0sQ0FBQyxNQUFNLE1BQU0sSUFBSSxJQUFJLE1BQU0sSUFBSSxDQUFDLFFBQVEsT0FBTyxNQUFNO0FBQzNELGVBQ0MsUUFBUSxLQUFLLE1BQ2IsUUFBUSxLQUFLLE1BQ2IsUUFBUSxLQUFLLE1BQ2IsUUFBUSxLQUFLLE1BQ2IsUUFBUSxLQUFLLE1BQ2IsUUFBUSxLQUFLO0FBQUEsTUFFZjtBQUFBLElBcEhHO0FBQUEsRUFxSEo7OztBQ3RJTyxNQUFNLFVBQVU7QUFDaEIsTUFBTSxTQUFTLElBQUk7QUFDbkIsTUFBTSxnQkFBZ0I7QUFDdEIsTUFBTSxxQkFBcUI7QUFFM0IsTUFBTSxLQUFLO0FBQUEsSUFDakIsY0FBYyxDQUFJLEdBQU0sTUFBUztBQUNoQyxhQUFPLElBQUksSUFBSSxLQUFLLElBQUksSUFBSSxJQUFJO0FBQUEsSUFDakM7QUFBQSxJQUNBLEtBQUssQ0FBSSxPQUFZLE1BQXlCO0FBQzdDLGFBQU8sTUFBTSxPQUFPLENBQUMsR0FBRyxNQUFNO0FBQzdCLGVBQU8sS0FBSyxJQUFJLEVBQUUsS0FBSyxPQUFPLENBQUMsSUFBSSxPQUFPLENBQUM7QUFBQSxNQUM1QyxHQUFHLENBQUM7QUFBQSxJQUNMO0FBQUEsSUFDQSxLQUFLLENBQUksT0FBWSxNQUF5QjtBQUM3QyxhQUFPLEtBQUssSUFBSSxNQUFNLE1BQU0sSUFBSSxNQUFNLElBQUksQ0FBQyxJQUFJLE1BQU0sSUFBSSxDQUFDLE1BQU0sT0FBTyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzNFO0FBQUEsSUFDQSxNQUFNLENBQUksVUFBZTtBQUN4QixhQUFPLE1BQU0sT0FBTyxDQUFDLEdBQUcsTUFBTyxJQUFJLElBQUksSUFBSSxHQUFJLENBQUM7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFPTyxNQUFNLGdCQUFnQixDQUFDLEdBQVcsR0FBVyxNQUFjO0FBQ2pFLFlBQVEsS0FBTSxJQUFJLFlBQWEsS0FBSyxXQUFXO0FBQUEsRUFDaEQ7QUErQk8sTUFBTSxrQkFBa0IsQ0FBQyxXQUFvQjtBQUVuRCxRQUFJLFFBQVEsSUFBSSxNQUFjLEtBQU0sSUFBSSxPQUFRO0FBQ2hELFFBQUk7QUFFSixRQUFJLE9BQU87QUFDWCxRQUFJLE9BQU87QUFDWCxRQUFJLE9BQU87QUFDWCxRQUFJLE9BQU87QUFDWCxRQUFJLE9BQU87QUFDWCxRQUFJLE9BQU87QUFFWCxRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFFSixXQUFPLFFBQVEsU0FBVSxPQUFPO0FBQy9CLE9BQUMsTUFBTSxNQUFNLElBQUksSUFBSSxNQUFNLElBQUksQ0FBQyxRQUFRLE9BQU8sTUFBTTtBQUVyRCxjQUFRLGNBQWMsTUFBTSxNQUFNLElBQUk7QUFDdEMsWUFBTSxLQUFLLEtBQUssTUFBTSxLQUFLLEtBQUssS0FBSztBQUVyQyxVQUFJLE9BQU87QUFBTSxlQUFPO0FBQUEsZUFDZixPQUFPO0FBQU0sZUFBTztBQUM3QixVQUFJLE9BQU87QUFBTSxlQUFPO0FBQUEsZUFDZixPQUFPO0FBQU0sZUFBTztBQUM3QixVQUFJLE9BQU87QUFBTSxlQUFPO0FBQUEsZUFDZixPQUFPO0FBQU0sZUFBTztBQUFBLElBQzlCLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTixNQUFNLElBQUksS0FBSyxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDeEQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQVdPLE1BQU0saUJBQWlCLENBQUMsT0FBYyxTQUF1QjtBQUVuRSxRQUFJLENBQUMsS0FBSyxNQUFNO0FBQUcsYUFBTyxDQUFDO0FBRTNCLFFBQUksS0FBSyxNQUFNLE1BQU0sR0FBRztBQUN2QixhQUFPLENBQUMsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUNwQjtBQUVBLFVBQU0sS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLFVBQU0sS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLFVBQU0sS0FBSyxLQUFLLEtBQUssS0FBSyxLQUFLO0FBQy9CLFVBQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFDO0FBQ2hDLFVBQU0sYUFBdUIsQ0FBQztBQUU5QixRQUFJLFFBQVE7QUFDWixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUdKLFFBQUksU0FBUyxJQUFJO0FBQ2hCLFdBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUNwQyxjQUFNO0FBQ04sYUFBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLGVBQUssSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksS0FBSztBQUNwQyxvQkFBUSxjQUFjLEdBQUcsR0FBRyxDQUFDO0FBQzdCLG1CQUFPLE1BQU0sS0FBSyxLQUFLO0FBQUEsVUFDeEI7QUFBQSxRQUNEO0FBQ0EsaUJBQVM7QUFDVCxtQkFBVyxDQUFDLElBQUk7QUFBQSxNQUNqQjtBQUFBLElBQ0QsV0FBVyxTQUFTLElBQUk7QUFDdkIsV0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLGNBQU07QUFDTixhQUFLLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDcEMsZUFBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLG9CQUFRLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDN0IsbUJBQU8sTUFBTSxLQUFLLEtBQUs7QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFDQSxpQkFBUztBQUNULG1CQUFXLENBQUMsSUFBSTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLGNBQU07QUFDTixhQUFLLElBQUksS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUs7QUFDcEMsZUFBSyxJQUFJLEtBQUssSUFBSSxLQUFLLEtBQUssSUFBSSxLQUFLO0FBQ3BDLG9CQUFRLGNBQWMsR0FBRyxHQUFHLENBQUM7QUFDN0IsbUJBQU8sTUFBTSxLQUFLLEtBQUs7QUFBQSxVQUN4QjtBQUFBLFFBQ0Q7QUFDQSxpQkFBUztBQUNULG1CQUFXLENBQUMsSUFBSTtBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQU9BLFVBQU0sUUFBUSxDQUFDLFVBQTJCO0FBQ3pDLFlBQU0sT0FBTyxHQUFHO0FBQ2hCLFlBQU0sT0FBTyxHQUFHO0FBQ2hCLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBRUosV0FBSyxJQUFJLEtBQUssSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFJLEdBQUcsS0FBSztBQUMxQyxZQUFJLFdBQVcsQ0FBQyxLQUFLLFFBQVEsR0FBRztBQUMvQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsY0FBUSxLQUFLLEtBQUs7QUFDbEIsY0FBUSxLQUFLLEtBQUs7QUFFbEIsYUFBTyxJQUFJLEtBQUssSUFBSTtBQUNwQixjQUFRLEtBQUssSUFBSSxJQUFJO0FBRXJCLGlCQUNDLFFBQVEsUUFDTCxLQUFLLElBQUksS0FBSyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQUUsSUFBSSxRQUFRLEVBQUUsSUFDMUMsS0FBSyxJQUFJLEtBQUssSUFBSSxHQUFHLENBQUMsRUFBRSxJQUFJLElBQUksT0FBTyxFQUFFO0FBRTdDLGFBQU8sQ0FBQyxXQUFXLFFBQVEsS0FBSyxZQUFZLEtBQUssSUFBSTtBQUFHO0FBRXhELFlBQU0sSUFBSSxJQUFJO0FBQ2QsWUFBTSxJQUFJLElBQUksV0FBVztBQUV6QixhQUFPLENBQUMsT0FBTyxLQUFLO0FBQUEsSUFDckI7QUFHQSxXQUFPLFNBQVMsS0FBSyxNQUFNLEdBQUcsSUFBSSxTQUFTLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxHQUFHO0FBQUEsRUFDdkU7OztBQ3pNTyxNQUFNLFFBQU4sTUFBVztBQUFBLElBZWpCLGNBQWM7QUFJZCxrQkFBTyxDQUFDLFNBQWU7QUFDdEIsYUFBSyxPQUFPLEtBQUs7QUFBQSxVQUNoQjtBQUFBLFVBQ0EsT0FBTyxLQUFLLElBQUk7QUFBQTtBQUFBLFFBQ2pCLENBQUM7QUFBQSxNQUNGO0FBTUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxxQkFBVSxNQUFNO0FBQ2YsZUFBTyxLQUFLLE9BQU8sSUFBSSxDQUFDLE9BQU8sR0FBRyxLQUFLO0FBQUEsTUFDeEM7QUFNQTtBQUFBO0FBQUE7QUFBQTtBQUFBLGtCQUFPLE1BQU07QUFDWixlQUFPLEtBQUssT0FBTyxLQUFLO0FBQUEsTUFDekI7QUFPQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsaUJBQU0sQ0FBQyxVQUFpQjtBQUV2QixpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLE9BQU8sS0FBSyxHQUFHLEtBQUs7QUFDNUMsY0FBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLEVBQUUsS0FBSyxTQUFTLEtBQUssR0FBRztBQUM3QyxtQkFBTyxLQUFLLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFBQSxVQUM1QjtBQUFBLFFBQ0Q7QUFFQSxlQUFPLEtBQUssUUFBUSxLQUFLO0FBQUEsTUFDMUI7QUFPQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEscUJBQVUsQ0FBQyxVQUFpQjtBQUMzQixZQUFJLEdBQUcsSUFBSSxJQUFJO0FBQ2YsYUFBSyxJQUFJLEdBQUcsSUFBSSxLQUFLLE9BQU8sS0FBSyxHQUFHLEtBQUs7QUFDeEMsZUFBSyxLQUFLO0FBQUEsWUFDVCxLQUFLLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxPQUFPLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFDbEQsS0FBSyxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUMsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLElBQ25ELEtBQUssSUFBSSxNQUFNLENBQUMsSUFBSSxLQUFLLE9BQU8sS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUFBLFVBQ3JEO0FBQ0EsY0FBSSxPQUFPLFVBQWEsS0FBSyxJQUFJO0FBQ2hDLGlCQUFLO0FBQ0wscUJBQVMsS0FBSyxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsVUFDOUI7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFLQTtBQUFBO0FBQUE7QUFBQSxxQkFBVSxNQUFNO0FBRWYsYUFBSyxPQUFPLEtBQUssQ0FBQyxHQUFhLE1BQWdCO0FBQzlDLGlCQUFPLEdBQUcsYUFBYSxHQUFHLElBQUksRUFBRSxLQUFLLEdBQUcsR0FBRyxJQUFJLEVBQUUsS0FBSyxDQUFDO0FBQUEsUUFDeEQsQ0FBQztBQUdELGNBQU0sU0FBUyxLQUFLLE9BQU8sQ0FBQyxFQUFFO0FBQzlCLFlBQUksT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsSUFBSSxLQUFLLE9BQU8sQ0FBQyxJQUFJO0FBQ2pELGVBQUssT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBR2hDLGNBQU0sTUFBTSxLQUFLLE9BQU8sU0FBUyxHQUNoQyxVQUFVLEtBQUssT0FBTyxHQUFHLEVBQUU7QUFDNUIsWUFBSSxRQUFRLENBQUMsSUFBSSxPQUFPLFFBQVEsQ0FBQyxJQUFJLE9BQU8sUUFBUSxDQUFDLElBQUk7QUFDeEQsZUFBSyxPQUFPLEdBQUcsRUFBRSxRQUFRLENBQUMsS0FBSyxLQUFLLEdBQUc7QUFFeEMsYUFBSyxPQUFPLEtBQUssTUFBSyxRQUFRO0FBQUEsTUFDL0I7QUFwRkMsV0FBSyxTQUFTLElBQUksT0FBaUIsTUFBSyxRQUFRO0FBQUEsSUFDakQ7QUFBQSxFQW9GRDtBQXJHTyxNQUFNLE9BQU47QUFJTjtBQUFBO0FBQUE7QUFBQSxFQUpZLEtBSUwsV0FBVyxDQUFDLEdBQWEsTUFBZ0I7QUFDL0MsV0FBTyxHQUFHO0FBQUEsTUFDVCxFQUFFLEtBQUssTUFBTSxJQUFJLEVBQUUsS0FBSyxPQUFPO0FBQUEsTUFDL0IsRUFBRSxLQUFLLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBTztBQUFBLElBQ2hDO0FBQUEsRUFDRDs7O0FDQ00sTUFBTSxXQUFXLENBQUMsUUFBaUIsY0FBc0I7QUFDL0QsUUFBSSxDQUFDLE9BQU8sVUFBVSxZQUFZLEtBQUssWUFBWSxLQUFLO0FBQ3ZELGFBQU8sSUFBSSxLQUFLO0FBQUEsSUFDakI7QUFJQSxVQUFNLEVBQUUsT0FBTyxLQUFLLElBQUksZ0JBQWdCLE1BQU07QUFHOUMsVUFBTSxLQUFLLElBQUksT0FBYSxDQUFDLEdBQUcsTUFBTTtBQUNyQyxhQUFPLEdBQUcsYUFBYSxFQUFFLE1BQU0sR0FBRyxFQUFFLE1BQU0sQ0FBQztBQUFBLElBQzVDLENBQUM7QUFDRCxPQUFHLEtBQUssSUFBSTtBQUlaLFVBQU0sT0FBTyxDQUFDLFdBQXlCLFdBQW1CO0FBQ3pELFVBQUksV0FBVyxVQUFVLEtBQUs7QUFDOUIsVUFBSSxpQkFBaUI7QUFDckIsVUFBSUM7QUFFSixhQUFPLGlCQUFpQixlQUFlO0FBRXRDLFlBQUksWUFBWTtBQUFRO0FBRXhCLFlBQUksbUJBQW1CO0FBQWU7QUFFdEMsWUFBSSxDQUFDLFVBQVUsS0FBSyxFQUFFLE1BQU07QUFBRztBQUUvQixRQUFBQSxRQUFPLFVBQVUsSUFBSTtBQUVyQixjQUFNLENBQUMsT0FBT0MsTUFBSyxJQUFJLGVBQWUsT0FBT0QsS0FBSTtBQUVqRCxZQUFJLENBQUMsT0FBTztBQUVYO0FBQUEsUUFDRDtBQUNBLGtCQUFVLEtBQUssS0FBSztBQUNwQixZQUFJQyxRQUFPO0FBRVYsb0JBQVUsS0FBS0EsTUFBSztBQUNwQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFNBQUssSUFBSSxxQkFBcUIsU0FBUztBQUd2QyxPQUFHLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDakIsYUFBTyxHQUFHLGFBQWEsRUFBRSxNQUFNLElBQUksRUFBRSxPQUFPLEdBQUcsRUFBRSxNQUFNLElBQUksRUFBRSxPQUFPLENBQUM7QUFBQSxJQUN0RSxDQUFDO0FBR0QsU0FBSyxJQUFJLFNBQVM7QUFHbEIsVUFBTSxPQUFPLElBQUksS0FBSztBQUN0QixXQUFPLEdBQUcsS0FBSyxHQUFHO0FBQ2pCLFdBQUssS0FBSyxHQUFHLElBQUksQ0FBQztBQUFBLElBQ25CO0FBRUEsV0FBTztBQUFBLEVBQ1I7OztBQy9FTyxNQUFJO0FBd0JKLE1BQU0sbUJBS1QsQ0FBQztBQUNMLE1BQU0sWUFBWSxvQkFBSSxJQUFrQztBQUVqRCxXQUFTLHFCQUNmLFVBQ0EsVUFDQSxxQkFBK0IsQ0FBQyxHQUNFO0FBQ2xDLHFCQUFpQixRQUFRLElBQUk7QUFBQSxNQUM1QjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTO0FBQ2IsV0FBTyxJQUFJLFNBQWU7QUFDekIsVUFBSSxRQUFRO0FBQ1gsZUFBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsZ0JBQU0sS0FBSyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sY0FBYztBQUNwRCxvQkFBVSxJQUFJLElBQUksQ0FBQyxTQUFTLE1BQU0sQ0FBQztBQUNuQyxpQkFBUztBQUFBLFlBQ1I7QUFBQSxjQUNDO0FBQUEsY0FDQTtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsWUFDQSxtQkFBbUIsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUFBLFVBQ3pEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixPQUFPO0FBRU4sYUFBSywwR0FBK0IsVUFBVSxJQUFJO0FBQ2xELFlBQUk7QUFDSCxnQkFBTSxTQUFTLFNBQVMsR0FBRyxJQUFJO0FBQy9CLGlCQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsUUFDOUIsU0FBUyxLQUFQO0FBQ0QsaUJBQU8sUUFBUSxPQUFPLEdBQUc7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQWFPLE1BQU0sa0JBQWtCO0FBQUEsSUFDOUI7QUFBQSxJQUNBLE9BQU8sS0FBa0IsWUFBWSxPQUFPO0FBQzNDLFlBQU0sU0FBUyxJQUFJLGdCQUFnQixJQUFJLE9BQU8sSUFBSSxNQUFNO0FBQ3hELFlBQU0sTUFBeUMsT0FBTztBQUFBLFFBQ3JEO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSztBQUNSLFlBQUksVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUN2QixjQUFNLE9BQU8sSUFBSSxhQUFhLEdBQUcsR0FBRyxPQUFPLE9BQU8sT0FBTyxNQUFNO0FBQy9ELGNBQU0sU0FBa0IsQ0FBQztBQUN6QixpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSyxRQUFRLEtBQUs7QUFDbEQsaUJBQU8sS0FBSztBQUFBLFlBQ1gsS0FBSyxLQUFLLElBQUksQ0FBQztBQUFBLFlBQ2YsS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDO0FBQUEsWUFDbkIsS0FBSyxLQUFLLElBQUksSUFBSSxDQUFDO0FBQUEsVUFDcEIsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxjQUFNLFNBQVMsU0FBUyxRQUFRLFNBQVM7QUFDekMsY0FBTSxTQUFrQixDQUFDO0FBQ3pCLGVBQU8sUUFBUSxFQUFFLFFBQVEsQ0FBQyxVQUFVLE9BQU8sS0FBSyxLQUFLLENBQUM7QUFDdEQsZUFBTztBQUFBLE1BQ1IsT0FBTztBQUNOLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVPLE1BQU0sb0JBQW9CO0FBQUEsSUFDaEM7QUFBQSxJQUNBLENBQUMsV0FBNEI7QUFDNUIsVUFBSSxXQUFXO0FBQ2QsbUJBQVcsT0FBTyxRQUFRO0FBQ3pCLG9CQUFVLEtBQUssT0FBTyxHQUFHLENBQUM7QUFBQSxRQUMzQjtBQUNBLFlBQUksMERBQWEsR0FBRyxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBQUEsRUFDRDs7O0FDbkhBLGNBQVksT0FBTyxRQUF5QztBQUMzRCxRQUFJO0FBQ0gsVUFBSSxvREFBWSxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssVUFBVSxJQUFJLEtBQUssSUFBSTtBQUM3RCxZQUFNLE1BQU0saUJBQWlCLElBQUksS0FBSyxRQUFRLEVBQUUsU0FBUyxHQUFHLElBQUksS0FBSyxJQUFJO0FBQ3pFLFlBQU0sU0FBUyxNQUFNO0FBQ3JCLGtCQUFZO0FBQUEsUUFDWCxJQUFJLElBQUksS0FBSztBQUFBLFFBQ2I7QUFBQSxNQUNELENBQXdCO0FBQUEsSUFDekIsU0FBUyxLQUFQO0FBQ0Q7QUFBQSxRQUNDO0FBQUEsUUFDQSxJQUFJLEtBQUs7QUFBQSxRQUNULElBQUksS0FBSztBQUFBLFFBQ1QsSUFBSSxLQUFLO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFDQSxrQkFBWTtBQUFBLFFBQ1gsSUFBSSxJQUFJLEtBQUs7QUFBQSxRQUNiLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxNQUNSLENBQXdCO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBRUEsTUFBSSw2REFBZ0I7IiwKICAibmFtZXMiOiBbInNlbGYiLCAic2F2ZUNvbmZpZyIsICJ2Ym94IiwgInZib3gyIl0KfQo=
