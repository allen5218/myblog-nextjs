import { describe, expect, test } from 'vitest'
import {
  compositeOver,
  contrastOf,
  contrastRatio,
  flattenLayers,
  parseColor,
  relativeLuminance,
} from '../helpers/color'

describe('parseColor', () => {
  test('hex 三碼、六碼與帶 alpha 的八碼', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor('#2d2d2d')).toEqual({ r: 45, g: 45, b: 45, a: 1 })
    expect(parseColor('#00000080').a).toBeCloseTo(0.502, 3)
  })

  test('rgb 與 rgba,rgba 的 alpha 不得被丟掉', () => {
    expect(parseColor('rgb(64, 64, 64)')).toEqual({ r: 64, g: 64, b: 64, a: 1 })
    expect(parseColor('rgba(0, 0, 0, 0.05)')).toEqual({ r: 0, g: 0, b: 0, a: 0.05 })
  })

  test('oklch 的無彩度端點可逐值驗證', () => {
    const black = parseColor('oklch(0 0 0)')
    expect(black.r).toBeCloseTo(0, 1)
    expect(black.g).toBeCloseTo(0, 1)
    expect(black.b).toBeCloseTo(0, 1)

    const white = parseColor('oklch(1 0 0)')
    expect(white.r).toBeCloseTo(255, 1)
    expect(white.g).toBeCloseTo(255, 1)
    expect(white.b).toBeCloseTo(255, 1)
  })

  // 這條專門擋「把 oklch 的三個數字當成 RGB 讀」這個靜默錯誤 —— 那會得到
  // r=0.656, g=0.241, b=354.308,而 354.308 根本不是合法通道值。
  test('oklch 不得被當成 RGB 逐數字讀取', () => {
    const parsed = parseColor('oklch(0.656 0.241 354.308)')
    for (const channel of [parsed.r, parsed.g, parsed.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
    expect(parsed).not.toEqual({ r: 0.656, g: 0.241, b: 354.308, a: 1 })
  })

  test('oklch 的色相真的有作用', () => {
    const magenta = parseColor('oklch(0.7 0.2 0)')
    const green = parseColor('oklch(0.7 0.2 145)')
    expect(magenta).not.toEqual(green)
  })

  // 無彩度端點(chroma=0)時 l/m/s 三項會收斂成同一個值,只能證明轉換矩陣
  // 「每一列係數總和為 1」,證明不了係數本身的排列是否正確 —— 把某兩列係數
  // 對調,列總和不變,黑白端點測試照樣通過。這條用有色相的值逐通道釘住矩陣
  // 係數的實際輸出,黑白端點測不到的錯誤這裡測得到。
  test('oklch 有色相時可逐通道釘住轉換矩陣係數', () => {
    const parsed = parseColor('oklch(0.7 0.2 145)')
    expect(parsed.r).toBeCloseTo(47.8531, 2)
    expect(parsed.g).toBeCloseTo(188.771, 2)
    expect(parsed.b).toBeCloseTo(67.8348, 2)
    expect(parsed.a).toBe(1)
  })

  test('oklch 的斜線 alpha', () => {
    expect(parseColor('oklch(0.5 0 0 / 0.4)').a).toBeCloseTo(0.4, 5)
  })

  test('其他格式一律拋錯,不得靜默猜測', () => {
    expect(() => parseColor('hsl(200 50% 50%)')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('color(display-p3 1 0 0)')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('red')).toThrow(/Unsupported colou?r/i)
  })

  // 只有 3/4/6/8 位是合法 hex 長度。用 {3,8} 的話 5 位值會被收下,
  // 而切割邏輯會用 size=2 去讀它,靜默算出一個看似合理的錯誤顏色。
  test('非法長度的 hex 必須拋錯,不得靜默切錯', () => {
    expect(() => parseColor('#12345')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('#1234567')).toThrow(/Unsupported colou?r/i)
    expect(() => parseColor('#12')).toThrow(/Unsupported colou?r/i)
  })
})

describe('lab()', () => {
  // CSS lab() 以 D50 為基準白點,不是螢幕慣用的 D65,所以實作在套用 sRGB 矩陣前
  // 要先用 Bradford 轉換把 D50 的 XYZ 轉成 D65 的 XYZ。這兩條端點測試涵蓋的正是
  // 這條轉換路徑的頭尾。
  test('lab 的無彩度端點:黑與白', () => {
    const black = parseColor('lab(0% 0 0)')
    expect(black.r).toBeCloseTo(0, 0)
    expect(black.g).toBeCloseTo(0, 0)
    expect(black.b).toBeCloseTo(0, 0)
    expect(black.a).toBe(1)

    const white = parseColor('lab(100% 0 0)')
    expect(white.r).toBeCloseTo(254.9, 0)
    expect(white.g).toBeCloseTo(255.0, 0)
    expect(white.b).toBeCloseTo(255.0, 0)
    expect(white.a).toBe(1)
  })

  // 這條專門擋「把 lab() 的三個數字當成 RGB 逐一讀取」這個靜默錯誤。lab() 的
  // a、b 軸是有正負號、數值可超過 255 的獨立座標,不是通道值本身;
  // 對照既有的 oklch 逐數字讀取測試,擋的是同一種失效模式。
  test('lab 不得被當成 RGB 逐數字讀取', () => {
    const parsed = parseColor('lab(87.73% -86.18 83.18)')
    for (const channel of [parsed.r, parsed.g, parsed.b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
    }
    expect(parsed).not.toEqual({ r: 87.73, g: -86.18, b: 83.18, a: 1 })
  })

  test('lab 的 a 軸(綠-紅)真的有作用', () => {
    const positiveA = parseColor('lab(50% 60 0)')
    const negativeA = parseColor('lab(50% -60 0)')
    expect(positiveA).not.toEqual(negativeA)
  })

  test('lab 的斜線 alpha', () => {
    expect(parseColor('lab(50% 0 0 / 0.4)').a).toBe(0.4)
  })

  test('座標數不足時拋錯,不得靜默猜測', () => {
    expect(() => parseColor('lab(50%)')).toThrow(/Unsupported colou?r/i)
  })
})

describe('alpha compositing', () => {
  test('5% 黑疊在白底上', () => {
    const result = compositeOver(parseColor('rgba(0, 0, 0, 0.05)'), parseColor('#fff'))
    expect(result.r).toBeCloseTo(242.25, 2)
    expect(result.a).toBe(1)
  })

  test('alpha 0 完全不影響底色;alpha 1 完全覆蓋', () => {
    expect(compositeOver(parseColor('rgba(0, 0, 0, 0)'), parseColor('#fff')).r).toBeCloseTo(255, 5)
    expect(compositeOver(parseColor('rgba(0, 0, 0, 1)'), parseColor('#fff')).r).toBeCloseTo(0, 5)
  })

  test('兩層半透明由上而下合成', () => {
    // 下層:50% 黑疊白 → 127.5;上層:50% 白疊 127.5 → 191.25
    const result = flattenLayers(['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)', '#fff'])
    expect(result.r).toBeCloseTo(191.25, 2)
  })

  test('遇到第一個不透明層就停止', () => {
    expect(flattenLayers(['rgba(0,0,0,0)', '#2d2d2d', '#fff']).r).toBeCloseTo(45, 5)
  })

  test('整疊都沒有不透明層時拋錯,不得默默當黑或白', () => {
    expect(() => flattenLayers(['rgba(0,0,0,0.5)'])).toThrow(/opaque/i)
  })
})

describe('contrast', () => {
  test('白對黑是 21,同色是 1', () => {
    expect(contrastRatio(parseColor('#fff'), parseColor('#000'))).toBeCloseTo(21, 5)
    expect(contrastRatio(parseColor('#777'), parseColor('#777'))).toBeCloseTo(1, 5)
  })

  // 注意:brief/設計文件原記 10.36,但用文件內給定的精確公式(與
  // tests/playwright/series.spec.ts 既有的 luminance/contrast 公式相同)實測算出
  // 10.368377760269818,四捨五入到小數點後 2 位是 10.37,不是 10.36(差 0.0084,
  // 超出 toBeCloseTo(…, 2) 的 0.005 容忍值)。已用 Node 獨立驗算並對照專案既有公式
  // 確認是文件端四捨五入誤差,不是實作錯誤,故訂正黃金值而非放寬精度。
  test('--hux-text 的淺色值對白底是 10.37', () => {
    expect(contrastRatio(parseColor('rgb(64, 64, 64)'), parseColor('#fff'))).toBeCloseTo(10.37, 2)
  })

  test('相對亮度與順序無關', () => {
    const a = parseColor('#00677d')
    const b = parseColor('#fff')
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10)
    expect(relativeLuminance(parseColor('#000'))).toBeCloseTo(0, 10)
    expect(relativeLuminance(parseColor('#fff'))).toBeCloseTo(1, 10)
  })

  test('contrastOf 會先把背景疊層攤平', () => {
    // popup 現況:白字對 #4db8d1 = 2.31(規範表列值)
    expect(contrastOf('#fff', ['#4db8d1'])).toBeCloseTo(2.31, 2)
    // --hux-on-interactive 對 --hux-interactive 的淺色值 = 6.49
    expect(contrastOf('#fff', ['#00677d'])).toBeCloseTo(6.49, 2)
  })

  // 這是目前唯一涵蓋 contrastOf 半透明前景分支(a < 1 時要先與背景合成)的
  // 斷言 —— 上面兩條既有 golden 傳的都是不透明的 #fff,那個分支從未被跑到。
  // 不要因為看起來多餘就刪掉:50% 黑疊在白底上會合成出 127.5 的灰,
  // 這個灰對白的對比才是 3.9767;若合成步驟被拿掉,算出的會是「未合成的
  // 半透明黑」直接對白的虛構對比值,這條測試就是為了擋住那個退化。
  test('contrastOf 對半透明前景要先合成再算對比', () => {
    expect(contrastOf('rgba(0, 0, 0, 0.5)', ['#fff'])).toBeCloseTo(3.9767, 3)
  })
})
