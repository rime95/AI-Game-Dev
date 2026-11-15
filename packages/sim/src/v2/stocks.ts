import { T } from './data';
import { rivalRevenue } from './markets';
import type { GameV2 } from './types';
import { clamp, log, money } from './util';

/**
 * The stock market, ported from Grounds Up (systems/market.ts and orders.ts) to a chip-company
 * world: weekly prices from fair value (earnings × a P/E that follows growth) times a sentiment
 * that drifts back after shocks; quarterly results where beats and misses move sentiment; growth
 * that mean-reverts; dividends; standing orders that fill on the weekly close. Shocks come from a
 * hash of the seed and week (not the game RNG), so they are fixed in advance.
 * Real companies, simulated behaviour: results and prices are fictional.
 */

export const MARKET_MODEL = {
  marketVolatility: 0.015,
  sentimentReversion: 0.08,
  earningsNoise: 0.08,
  longRunGrowth: 0.04,
  growthReversion: 0.05,
  earningsReaction: 1,
  maxSurprise: 0.25,
  tradeFee: 0.001,
  priceImpact: 2,
};

export interface StockDef {
  ticker: string;
  name: string;
  sector: 'Chips' | 'Computers' | 'Software' | 'Internet' | 'Equipment' | 'Consumer' | 'Telecom' | 'Energy' | 'Finance';
  domain: string;
  /** First year it trades (its real listing year). */
  listYear: number;
  price: number;
  pe0: number;
  growth0: number;
  payout: number;
  volatility: number;
  shares: number;
  /** Follows this rival's simulated sales. */
  rivalId?: string;
}

export const STOCKS: StockDef[] = [
  { ticker: 'INTC', name: 'Intel', sector: 'Chips', domain: 'intel.com', listYear: 1971, price: 45, pe0: 14, growth0: 0.18, payout: 0.1, volatility: 0.04, shares: 2e9, rivalId: 'intel' },
  { ticker: 'AMD', name: 'AMD', sector: 'Chips', domain: 'amd.com', listYear: 1972, price: 12, pe0: 16, growth0: 0.12, payout: 0, volatility: 0.07, shares: 1e9, rivalId: 'amd' },
  { ticker: 'NVDA', name: 'Nvidia', sector: 'Chips', domain: 'nvidia.com', listYear: 1999, price: 12, pe0: 30, growth0: 0.35, payout: 0, volatility: 0.07, shares: 2.4e9, rivalId: 'nvidia' },
  { ticker: 'QCOM', name: 'Qualcomm', sector: 'Chips', domain: 'qualcomm.com', listYear: 1991, price: 16, pe0: 22, growth0: 0.2, payout: 0.3, volatility: 0.05, shares: 1.1e9, rivalId: 'qualcomm' },
  { ticker: 'TXN', name: 'Texas Instruments', sector: 'Chips', domain: 'ti.com', listYear: 1953, price: 30, pe0: 15, growth0: 0.08, payout: 0.4, volatility: 0.035, shares: 0.9e9 },
  { ticker: 'MU', name: 'Micron', sector: 'Chips', domain: 'micron.com', listYear: 1984, price: 8, pe0: 12, growth0: 0.1, payout: 0, volatility: 0.08, shares: 1.1e9 },
  { ticker: 'TSM', name: 'TSMC', sector: 'Chips', domain: 'tsmc.com', listYear: 1994, price: 10, pe0: 18, growth0: 0.2, payout: 0.4, volatility: 0.04, shares: 5e9 },
  { ticker: 'AVGO', name: 'Broadcom', sector: 'Chips', domain: 'broadcom.com', listYear: 1998, price: 20, pe0: 22, growth0: 0.18, payout: 0.3, volatility: 0.05, shares: 0.5e9 },
  { ticker: 'ASML', name: 'ASML', sector: 'Equipment', domain: 'asml.com', listYear: 1995, price: 15, pe0: 25, growth0: 0.15, payout: 0.3, volatility: 0.05, shares: 0.4e9 },
  { ticker: 'AMAT', name: 'Applied Materials', sector: 'Equipment', domain: 'appliedmaterials.com', listYear: 1972, price: 14, pe0: 16, growth0: 0.12, payout: 0.2, volatility: 0.05, shares: 0.9e9 },
  { ticker: 'IBM', name: 'IBM', sector: 'Computers', domain: 'ibm.com', listYear: 1924, price: 110, pe0: 12, growth0: 0.03, payout: 0.5, volatility: 0.03, shares: 0.6e9 },
  { ticker: 'AAPL', name: 'Apple', sector: 'Computers', domain: 'apple.com', listYear: 1980, price: 25, pe0: 14, growth0: 0.08, payout: 0.2, volatility: 0.05, shares: 1e9 },
  { ticker: 'HPQ', name: 'HP', sector: 'Computers', domain: 'hp.com', listYear: 1957, price: 40, pe0: 13, growth0: 0.06, payout: 0.3, volatility: 0.035, shares: 0.8e9 },
  { ticker: 'CPQ', name: 'Compaq', sector: 'Computers', domain: 'compaq.com', listYear: 1985, price: 22, pe0: 14, growth0: 0.15, payout: 0, volatility: 0.05, shares: 0.4e9 },
  { ticker: 'DELL', name: 'Dell', sector: 'Computers', domain: 'dell.com', listYear: 1988, price: 6, pe0: 16, growth0: 0.3, payout: 0, volatility: 0.06, shares: 0.7e9 },
  { ticker: 'SONY', name: 'Sony', sector: 'Consumer', domain: 'sony.com', listYear: 1970, price: 40, pe0: 18, growth0: 0.06, payout: 0.2, volatility: 0.04, shares: 1.2e9 },
  { ticker: 'NTDOY', name: 'Nintendo', sector: 'Consumer', domain: 'nintendo.com', listYear: 1983, price: 20, pe0: 16, growth0: 0.1, payout: 0.4, volatility: 0.05, shares: 1.3e9 },
  { ticker: 'MSFT', name: 'Microsoft', sector: 'Software', domain: 'microsoft.com', listYear: 1986, price: 30, pe0: 25, growth0: 0.3, payout: 0, volatility: 0.04, shares: 0.6e9 },
  { ticker: 'ORCL', name: 'Oracle', sector: 'Software', domain: 'oracle.com', listYear: 1986, price: 8, pe0: 20, growth0: 0.2, payout: 0, volatility: 0.06, shares: 1e9 },
  { ticker: 'CSCO', name: 'Cisco', sector: 'Telecom', domain: 'cisco.com', listYear: 1990, price: 6, pe0: 30, growth0: 0.4, payout: 0, volatility: 0.06, shares: 1e9 },
  { ticker: 'AMZN', name: 'Amazon', sector: 'Internet', domain: 'amazon.com', listYear: 1997, price: 18, pe0: 60, growth0: 0.5, payout: 0, volatility: 0.08, shares: 0.4e9 },
  { ticker: 'GOOGL', name: 'Alphabet', sector: 'Internet', domain: 'abc.xyz', listYear: 2004, price: 85, pe0: 40, growth0: 0.4, payout: 0, volatility: 0.05, shares: 0.6e9, rivalId: 'google' },
  { ticker: 'META', name: 'Meta', sector: 'Internet', domain: 'meta.com', listYear: 2012, price: 38, pe0: 35, growth0: 0.35, payout: 0, volatility: 0.06, shares: 2.5e9, rivalId: 'meta' },
  { ticker: 'NFLX', name: 'Netflix', sector: 'Internet', domain: 'netflix.com', listYear: 2002, price: 15, pe0: 40, growth0: 0.3, payout: 0, volatility: 0.07, shares: 0.4e9 },
  { ticker: 'T', name: 'AT&T', sector: 'Telecom', domain: 'att.com', listYear: 1984, price: 35, pe0: 12, growth0: 0.03, payout: 0.6, volatility: 0.025, shares: 1.1e9 },
  { ticker: 'VZ', name: 'Verizon', sector: 'Telecom', domain: 'verizon.com', listYear: 1984, price: 40, pe0: 11, growth0: 0.03, payout: 0.6, volatility: 0.025, shares: 1.4e9 },
  { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy', domain: 'exxonmobil.com', listYear: 1920, price: 55, pe0: 11, growth0: 0.03, payout: 0.5, volatility: 0.03, shares: 1.3e9 },
  { ticker: 'KO', name: 'Coca-Cola', sector: 'Consumer', domain: 'coca-colacompany.com', listYear: 1919, price: 40, pe0: 20, growth0: 0.08, payout: 0.5, volatility: 0.025, shares: 1.3e9 },
  { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Finance', domain: 'jpmorganchase.com', listYear: 1969, price: 30, pe0: 10, growth0: 0.05, payout: 0.35, volatility: 0.035, shares: 1.8e9 },
  { ticker: 'BRK', name: 'Berkshire Hathaway', sector: 'Finance', domain: 'berkshirehathaway.com', listYear: 1980, price: 9000, pe0: 15, growth0: 0.08, payout: 0, volatility: 0.025, shares: 1.2e6 },
];

export interface Listed {
  ticker: string;
  price: number;
  /** Quarterly earnings per share. */
  eps: number;
  growth: number;
  pe: number;
  sentiment: number;
  history: number[];
  /** The rival's sales at the last results (for rival-linked stocks). */
  lastRivalSales?: number;
  delisted?: boolean;
  lastResult?: { day: number; change: number; expected: number };
}

export interface StockOrder {
  id: string;
  ticker: string;
  kind: 'stopLoss' | 'takeProfit' | 'buyBelow';
  trigger: number;
  shares: number;
}

/** A deterministic 0–1 draw from any parts (FNV-1a then a mulberry32 finish), like Grounds Up's hash01. */
export function hash01(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c;
    h = Math.imul(h, 0x01000193);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const stockDef = (t: string) => STOCKS.find((x) => x.ticker === t)!;
export const peForGrowth = (d: StockDef, growth: number) => (d.pe0 * (10 + 100 * growth)) / (10 + 100 * d.growth0);
export const fairValue = (l: Listed) => Math.max(0.5, l.eps * 4 * l.pe);

export function initialMarket(): Listed[] {
  return STOCKS.map((d) => ({ ticker: d.ticker, price: d.price, eps: d.price / d.pe0 / 4, growth: d.growth0, pe: d.pe0, sentiment: 1, history: [d.price] }));
}

/** Stocks you can trade today (listed by now and not taken private). */
export function tradable(s: GameV2): Listed[] {
  const year = T.startYear + Math.floor(s.day / 360);
  return s.stocks.filter((l) => !l.delisted && stockDef(l.ticker).listYear <= year);
}

/** Weekly close: market-wide and own shocks move sentiment; prices follow fair value × sentiment. Then standing orders fill. */
export function weeklyMarket(s: GameV2): void {
  const week = Math.floor(s.day / 7);
  const shock = (hash01(s.seed, 'mkt', week) * 2 - 1) * MARKET_MODEL.marketVolatility * 1.7;
  for (const l of s.stocks) {
    if (l.delisted) continue;
    const d = stockDef(l.ticker);
    const own = (hash01(s.seed, 'stk', l.ticker, week) * 2 - 1) * d.volatility * 1.7;
    l.sentiment = clamp(l.sentiment + MARKET_MODEL.sentimentReversion * (1 - l.sentiment) + shock + own, 0.5, 1.8);
    l.price = Math.max(0.5, Math.round(fairValue(l) * l.sentiment * 100) / 100);
    l.history.push(l.price);
    if (l.history.length > 104) l.history.shift();
  }
  fillOrders(s);
}

/** Quarterly results: earnings move (rival stocks follow the rival's sales), beats and misses move sentiment, dividends are paid. */
export function quarterlyMarket(s: GameV2): void {
  const q = Math.floor(s.day / 90);
  let dividends = 0;
  for (const l of s.stocks) {
    if (l.delisted) continue;
    const d = stockDef(l.ticker);
    const before = l.eps;
    const rival = d.rivalId ? s.rivals.find((r) => r.id === d.rivalId) : undefined;
    if (rival && !rival.acquired && rival.products.length) {
      const sales = rivalRevenue(s, rival);
      if (l.lastRivalSales && l.lastRivalSales > 0) l.eps *= clamp(sales / l.lastRivalSales, 0.75, 1.3);
      l.lastRivalSales = sales;
    } else l.eps *= 1 + l.growth / 4 + (hash01(s.seed, 'eps', l.ticker, q) * 2 - 1) * MARKET_MODEL.earningsNoise;
    const change = before > 0 ? l.eps / before - 1 : 0;
    const surprise = clamp(change - l.growth / 4, -MARKET_MODEL.maxSurprise, MARKET_MODEL.maxSurprise);
    l.lastResult = { day: s.day, change, expected: l.growth / 4 };
    l.sentiment = clamp(l.sentiment + surprise * MARKET_MODEL.earningsReaction, 0.5, 1.8);
    l.growth += (MARKET_MODEL.longRunGrowth - l.growth) * MARKET_MODEL.growthReversion;
    l.pe = peForGrowth(d, l.growth);
    const h = s.personal.portfolio[l.ticker];
    if (h && h.shares > 0) dividends += Math.max(0, l.eps * d.payout) * h.shares;
  }
  if (dividends > 0) {
    s.personal.cash += dividends;
    s.personal.dividends += dividends;
    log(s, `Dividends paid into your own account: ${money(dividends)}.`, 'good');
  }
  // A rival you bought is taken private: your shares in it are paid out at the last price.
  for (const r of s.rivals.filter((x) => x.acquired)) {
    const d = STOCKS.find((x) => x.rivalId === r.id);
    const l = d && s.stocks.find((x) => x.ticker === d.ticker);
    if (!l || l.delisted) continue;
    l.delisted = true;
    const h = s.personal.portfolio[l.ticker];
    if (h) {
      s.personal.cash += h.shares * l.price;
      delete s.personal.portfolio[l.ticker];
    }
  }
}

const buyFill = (l: Listed, n: number) => l.price * (1 + (MARKET_MODEL.priceImpact * n) / stockDef(l.ticker).shares / 2);
const sellFill = (l: Listed, n: number) => l.price * (1 - (MARKET_MODEL.priceImpact * n) / stockDef(l.ticker).shares / 2);

export function buyShares(s: GameV2, ticker: string, n: number): string | null {
  const l = tradable(s).find((x) => x.ticker === ticker);
  if (!l) return 'That company isn’t traded.';
  if (!(n > 0) || !Number.isInteger(n)) return 'Buy a whole number of shares.';
  const fill = buyFill(l, n);
  const cost = fill * n * (1 + MARKET_MODEL.tradeFee);
  if (cost > s.personal.cash) return `That costs ${money(cost)}; you have ${money(s.personal.cash)} of your own.`;
  s.personal.cash -= cost;
  const h = (s.personal.portfolio[ticker] ??= { shares: 0, cost: 0 });
  h.shares += n;
  h.cost += cost;
  l.price = Math.round(l.price * (1 + (MARKET_MODEL.priceImpact * n) / stockDef(ticker).shares) * 100) / 100;
  log(s, `Bought ${n.toLocaleString('en-US')} ${ticker} at ${money(fill)} (${money(cost)}).`);
  return null;
}

export function sellShares(s: GameV2, ticker: string, n: number): string | null {
  const l = s.stocks.find((x) => x.ticker === ticker);
  const h = s.personal.portfolio[ticker];
  if (!l || !h || h.shares < n || !(n > 0)) return 'You don’t own that many shares.';
  const fill = sellFill(l, n);
  const proceeds = fill * n * (1 - MARKET_MODEL.tradeFee);
  h.cost *= (h.shares - n) / h.shares;
  h.shares -= n;
  if (h.shares === 0) delete s.personal.portfolio[ticker];
  s.personal.cash += proceeds;
  l.price = Math.max(0.5, Math.round(l.price * (1 - (MARKET_MODEL.priceImpact * n) / stockDef(ticker).shares) * 100) / 100);
  log(s, `Sold ${n.toLocaleString('en-US')} ${ticker} at ${money(fill)} (${money(proceeds)}).`);
  return null;
}

/** Standing orders fill on the weekly close, so a stop can fill below its trigger after a sharp drop. */
function fillOrders(s: GameV2): void {
  for (const o of [...s.personal.orders]) {
    const l = s.stocks.find((x) => x.ticker === o.ticker);
    if (!l || l.delisted) {
      s.personal.orders = s.personal.orders.filter((x) => x !== o);
      continue;
    }
    const held = s.personal.portfolio[o.ticker]?.shares ?? 0;
    const hit = o.kind === 'stopLoss' ? l.price <= o.trigger : o.kind === 'takeProfit' ? l.price >= o.trigger : l.price <= o.trigger;
    if (!hit) continue;
    s.personal.orders = s.personal.orders.filter((x) => x !== o);
    if (o.kind === 'buyBelow') {
      const afford = Math.floor(s.personal.cash / (l.price * (1 + MARKET_MODEL.tradeFee) * 1.01));
      const n = Math.min(o.shares, afford);
      if (n > 0) buyShares(s, o.ticker, n);
    } else {
      const n = Math.min(o.shares, held);
      if (n > 0) sellShares(s, o.ticker, n);
    }
  }
}

export function placeOrder(s: GameV2, o: Omit<StockOrder, 'id'>): string | null {
  const l = tradable(s).find((x) => x.ticker === o.ticker);
  if (!l) return 'That company isn’t traded.';
  if (!(o.shares > 0) || !(o.trigger > 0)) return 'Set a trigger price and a number of shares.';
  if (o.kind !== 'buyBelow' && (s.personal.portfolio[o.ticker]?.shares ?? 0) < o.shares) return 'You don’t own that many shares.';
  if (o.kind === 'stopLoss' && o.trigger >= l.price) return 'A stop-loss sits below today’s price.';
  if (o.kind === 'takeProfit' && o.trigger <= l.price) return 'Take-profit sits above today’s price.';
  if (o.kind === 'buyBelow' && o.trigger >= l.price) return 'Buy-below sits below today’s price.';
  s.personal.orders.push({ ...o, id: `ord-${s.nextId++}` });
  return null;
}

export const portfolioValue = (s: GameV2) =>
  Object.entries(s.personal.portfolio).reduce((n, [t, h]) => n + h.shares * (s.stocks.find((x) => x.ticker === t)?.price ?? 0), 0);
