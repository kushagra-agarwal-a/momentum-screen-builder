export const INDEX_OPTIONS = [
  { value: "is_nifty_50", label: "NIFTY 50" },
  { value: "is_nifty_next_50", label: "NIFTY NEXT 50" },
  { value: "is_nifty_100", label: "NIFTY 100" },
  { value: "is_nifty_200", label: "NIFTY 200" },
  { value: "is_nifty_500", label: "NIFTY 500" },
  { value: "is_nifty_total_market", label: "NIFTY TOTAL MARKET" },
  { value: "is_nifty_large_mid_250", label: "NIFTY LARGE MID 250" },
  { value: "is_nifty_midcap_150", label: "NIFTY MIDCAP 150" },
  { value: "is_nifty_smallcap_250", label: "NIFTY SMALLCAP 250" },
  { value: "is_nifty_microcap_250", label: "NIFTY MICROCAP 250" },
  { value: "is_nifty_mid_small_400", label: "NIFTY MID SMALL 400" },
  { value: "is_nifty_fo", label: "NIFTY F&O (N500 proxy)" },
  { value: "is_nse_750", label: "NSE 750" },
  { value: "is_all_nse", label: "All NSE Listed Stocks" },
  { value: "is_etf", label: "All NSE Listed ETFs" },
] as const;

export const SORT_OPTIONS = [
  { value: "absolute_return_1_year", label: "Absolute return 1 year" },
  { value: "absolute_return_9_months", label: "Absolute return 9 months" },
  { value: "absolute_return_6_months", label: "Absolute return 6 months" },
  { value: "absolute_return_3_months", label: "Absolute return 3 months" },
  { value: "absolute_return_1_months", label: "Absolute return 1 months" },
  { value: "average_absolute_return_12_9_6_3_1_months", label: "Average absolute return 12 9 6 3 1 months" },
  { value: "average_absolute_return_12_9_6_3_months", label: "Average absolute return 12 9 6 3 months" },
  { value: "average_absolute_return_12_9_6_months", label: "Average absolute return 12 9 6 months" },
  { value: "average_absolute_return_12_9_months", label: "Average absolute return 12 9 months" },
  { value: "average_absolute_return_12_6_3_1_months", label: "Average absolute return 12 6 3 1 months" },
  { value: "average_absolute_return_12_6_3_months", label: "Average absolute return 12 6 3 months" },
  { value: "average_absolute_return_12_6_months", label: "Average absolute return 12 6 months" },
  { value: "average_absolute_return_12_3_1_months", label: "Average absolute return 12 3 1 months" },
  { value: "average_absolute_return_12_3_months", label: "Average absolute return 12 3 months" },
  { value: "average_absolute_return_12_9_3_1_months", label: "Average absolute return 12 9 3 1 months" },
  { value: "average_absolute_return_12_9_3_months", label: "Average absolute return 12 9 3 months" },
  { value: "sharpe_return_1_year", label: "Sharpe return 1 year" },
  { value: "sharpe_return_9_months", label: "Sharpe return 9 months" },
  { value: "sharpe_return_6_months", label: "Sharpe return 6 months" },
  { value: "sharpe_return_3_months", label: "Sharpe return 3 months" },
  { value: "sharpe_return_1_months", label: "Sharpe return 1 months" },
  { value: "average_sharpe_return_12_9_6_3_1_months", label: "Average sharpe return 12 9 6 3 1 months" },
  { value: "average_sharpe_return_12_9_6_3_months", label: "Average sharpe return 12 9 6 3 months" },
  { value: "average_sharpe_return_12_9_6_months", label: "Average sharpe return 12 9 6 months" },
  { value: "average_sharpe_return_12_9_months", label: "Average sharpe return 12 9 months" },
  { value: "average_sharpe_return_12_6_3_1_months", label: "Average sharpe return 12 6 3 1 months" },
  { value: "average_sharpe_return_12_6_3_months", label: "Average sharpe return 12 6 3 months" },
  { value: "average_sharpe_return_12_6_months", label: "Average sharpe return 12 6 months" },
  { value: "average_sharpe_return_12_3_1_months", label: "Average sharpe return 12 3 1 months" },
  { value: "average_sharpe_return_12_3_months", label: "Average sharpe return 12 3 months" },
  { value: "average_sharpe_return_12_9_3_1_months", label: "Average sharpe return 12 9 3 1 months" },
  { value: "average_sharpe_return_12_9_3_months", label: "Average sharpe return 12 9 3 months" },
  { value: "average_sharpe_return_6_3_months", label: "Average sharpe return 6 3 months" },
  { value: "rsi_1_year", label: "Rsi 1 year" },
  { value: "rsi_9_months", label: "Rsi 9 months" },
  { value: "rsi_6_months", label: "Rsi 6 months" },
  { value: "rsi_3_months", label: "Rsi 3 months" },
  { value: "rsi_1_months", label: "Rsi 1 months" },
  { value: "average_rsi_12_9_6_3_1_months", label: "Average rsi 12 9 6 3 1 months" },
  { value: "average_rsi_12_9_6_3_months", label: "Average rsi 12 9 6 3 months" },
  { value: "average_rsi_12_9_6_months", label: "Average rsi 12 9 6 months" },
  { value: "average_rsi_12_9_months", label: "Average rsi 12 9 months" },
  { value: "average_rsi_12_6_3_1_months", label: "Average rsi 12 6 3 1 months" },
  { value: "average_rsi_12_6_3_months", label: "Average rsi 12 6 3 months" },
  { value: "average_rsi_12_6_months", label: "Average rsi 12 6 months" },
  { value: "average_rsi_12_3_1_months", label: "Average rsi 12 3 1 months" },
  { value: "average_rsi_12_3_months", label: "Average rsi 12 3 months" },
  { value: "average_rsi_12_9_3_1_months", label: "Average rsi 12 9 3 1 months" },
  { value: "average_rsi_12_9_3_months", label: "Average rsi 12 9 3 months" },
  { value: "absolute_divide_beta_return_1_year", label: "Absolute divide beta return 1 year" },
  { value: "sharpe_divide_beta_return_1_year", label: "Sharpe divide beta return 1 year" },
  { value: "average_sharpe_divide_beta_return_12_9_6_3_months", label: "Average sharpe divide beta return 12 9 6 3 months" },
  { value: "average_sharpe_divide_beta_return_12_6_3_months", label: "Average sharpe divide beta return 12 6 3 months" },
  { value: "average_sharpe_divide_beta_return_12_6_months", label: "Average sharpe divide beta return 12 6 months" },
  { value: "return_12_minus_1_months", label: "Return 12 minus 1 months" },
  { value: "return_12_minus_two_months", label: "Return 12 minus two months" },
  { value: "volatility_1_year", label: "Volatility 1 year" },
  { value: "beta", label: "Beta" },
  { value: "price_to_earnings", label: "Price to earnings" },
  { value: "marketcap", label: "Marketcap" },
  { value: "close", label: "Close" },
  { value: "close_raw", label: "Close raw" },
  { value: "away_from_high_all_time", label: "Away from high all time" },
  { value: "away_from_high_1_year", label: "Away from high 1 year" },
] as const;

export const SORT_WITH_NONE = [{ value: "none", label: "None" }, ...SORT_OPTIONS];

export type ScreenRequest = {
  index: string;
  sort_by: string;
  sort_direction: "desc" | "asc";
  sort_by_two: string;
  sort_direction_two: "desc" | "asc";
  sort_by_three: string;
  sort_direction_three: "desc" | "asc";
  median_volume: number;
  away_from_high: number;
  away_from_five_year_high: number;
  away_from_all_time_high: number;
  ma_200: "yes" | "no";
  ma_100: "yes" | "no";
  minimum_return_one_year: "none" | "repo";
  annual_return_above_volatility: "yes" | "no";
  percentage_positive_days_one_year: number;
  percentage_positive_days_six_months: number;
  percentage_positive_days_three_months: number;
  exclude_stocks_with_circuits_one_year: number;
  apply_filters_on: "all" | "ranked";
  series: "all" | "eq";
  ignore_top_beta: "yes" | "no";
  limit: number;
  sync_data: boolean;
  apply_corporate_actions: boolean;
};

export const DEFAULT_SCREEN: ScreenRequest = {
  index: "is_nifty_500",
  sort_by: "average_sharpe_return_12_6_3_months",
  sort_direction: "desc",
  sort_by_two: "return_12_minus_1_months",
  sort_direction_two: "desc",
  sort_by_three: "none",
  sort_direction_three: "desc",
  median_volume: 0,
  away_from_high: -100,
  away_from_five_year_high: -100,
  away_from_all_time_high: -100,
  ma_200: "no",
  ma_100: "no",
  minimum_return_one_year: "none",
  annual_return_above_volatility: "no",
  percentage_positive_days_one_year: 0,
  percentage_positive_days_six_months: 0,
  percentage_positive_days_three_months: 0,
  exclude_stocks_with_circuits_one_year: 0,
  apply_filters_on: "all",
  series: "all",
  ignore_top_beta: "no",
  limit: 50,
  sync_data: true,
  /** Off by default on hosted runs to avoid Vercel 60s timeouts; enable for CA-adjusted ranks (e.g. STLTECH). */
  apply_corporate_actions: false,
};
