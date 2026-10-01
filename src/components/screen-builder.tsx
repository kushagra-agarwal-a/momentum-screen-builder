"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_SCREEN,
  INDEX_OPTIONS,
  SORT_OPTIONS,
  SORT_WITH_NONE,
  type ScreenRequest,
} from "@/lib/screen-config";

type Row = {
  rank?: number;
  symbol: string;
  close?: number;
  primary?: number | null;
};

type ScreenResult = {
  error?: string;
  warning?: string;
  index_label?: string;
  as_of?: string;
  universe_count?: number;
  evaluated?: number;
  ranked_with_primary?: number;
  sync?: { fetched_days?: number; lookback_requested?: number; errors?: string[] };
  rows?: Row[];
};

function fmtNum(v: number | null | undefined, pct = false) {
  if (v == null || Number.isNaN(v)) return "—";
  if (pct) return `${(v * 100).toFixed(2)}%`;
  return v.toFixed(4);
}

export function ScreenBuilder() {
  const [cfg, setCfg] = useState<ScreenRequest>(DEFAULT_SCREEN);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScreenResult | null>(null);

  const sortLabel = useMemo(
    () => SORT_OPTIONS.find((s) => s.value === cfg.sort_by)?.label ?? cfg.sort_by,
    [cfg.sort_by],
  );

  function patch(p: Partial<ScreenRequest>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  async function runScreen() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const data = (await res.json()) as ScreenResult;
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  function loadPreset(name: "viraj" | "sharpe" | "lowvol") {
    if (name === "viraj") {
      setCfg({
        ...DEFAULT_SCREEN,
        index: "is_nse_750",
        sort_by: "average_sharpe_return_12_6_3_months",
        sort_by_two: "return_12_minus_1_months",
        median_volume: 2_500_000,
        percentage_positive_days_one_year: 50,
        ma_200: "yes",
        exclude_stocks_with_circuits_one_year: 5,
      });
    } else if (name === "sharpe") {
      setCfg({
        ...DEFAULT_SCREEN,
        index: "is_nifty_total_market",
        sort_by: "sharpe_return_1_year",
      });
    } else {
      setCfg({
        ...DEFAULT_SCREEN,
        index: "is_nifty_total_market",
        sort_by: "volatility_1_year",
        sort_direction: "asc",
      });
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 pb-16 md:p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Momentum Screen Builder</h1>
        <p className="max-w-3xl text-muted-foreground">
          Build MomoIndia-style momentum screens with all 64 sort factors, multi-sort, liquidity and
          trend filters. Prices sync from NSE bhavcopy on each run (first run may take a few minutes).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => loadPreset("viraj")}>
            Viraj-style preset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => loadPreset("sharpe")}>
            Sharpe 1Y preset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => loadPreset("lowvol")}>
            Low vol preset
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Screen config</CardTitle>
            <CardDescription>Universe, ranking, and filters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="core">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="core">Core</TabsTrigger>
                <TabsTrigger value="filters">Filters</TabsTrigger>
              </TabsList>
              <TabsContent value="core" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Index universe</Label>
                  <NativeSelect
                    value={cfg.index}
                    onChange={(v) => patch({ index: v })}
                    options={INDEX_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort by</Label>
                  <NativeSelect
                    value={cfg.sort_by}
                    onChange={(v) => patch({ sort_by: v })}
                    options={SORT_OPTIONS}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort direction</Label>
                  <NativeSelect
                    value={cfg.sort_direction}
                    onChange={(v) => patch({ sort_direction: v as "desc" | "asc" })}
                    options={[
                      { value: "desc", label: "Highest to Lowest" },
                      { value: "asc", label: "Lowest to Highest" },
                    ]}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>Sort by (secondary)</Label>
                  <NativeSelect
                    value={cfg.sort_by_two}
                    onChange={(v) => patch({ sort_by_two: v })}
                    options={SORT_WITH_NONE}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sort by (tertiary)</Label>
                  <NativeSelect
                    value={cfg.sort_by_three}
                    onChange={(v) => patch({ sort_by_three: v })}
                    options={SORT_WITH_NONE}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Result limit</Label>
                  <Input
                    type="number"
                    min={10}
                    max={500}
                    value={cfg.limit}
                    onChange={(e) => patch({ limit: Number(e.target.value) || 50 })}
                  />
                </div>
              </TabsContent>
              <TabsContent value="filters" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Median volume (min, shares)</Label>
                  <Input
                    type="number"
                    value={cfg.median_volume}
                    onChange={(e) => patch({ median_volume: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <Label>Away from 1Y high (min %)</Label>
                    <Input
                      type="number"
                      value={cfg.away_from_high}
                      onChange={(e) => patch({ away_from_high: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Away from 5Y high (min %)</Label>
                    <Input
                      type="number"
                      value={cfg.away_from_five_year_high}
                      onChange={(e) => patch({ away_from_five_year_high: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Away from ATH (min %)</Label>
                    <Input
                      type="number"
                      value={cfg.away_from_all_time_high}
                      onChange={(e) => patch({ away_from_all_time_high: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ma200">Above 200 DMA</Label>
                  <Switch
                    id="ma200"
                    checked={cfg.ma_200 === "yes"}
                    onCheckedChange={(c) => patch({ ma_200: c ? "yes" : "no" })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="ma100">Above 100 DMA</Label>
                  <Switch
                    id="ma100"
                    checked={cfg.ma_100 === "yes"}
                    onCheckedChange={(c) => patch({ ma_100: c ? "yes" : "no" })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min 1Y return vs repo</Label>
                  <NativeSelect
                    value={cfg.minimum_return_one_year}
                    onChange={(v) => patch({ minimum_return_one_year: v as "none" | "repo" })}
                    options={[
                      { value: "none", label: "No minimum" },
                      { value: "repo", label: "Above repo (~6.5%)" },
                    ]}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="retvol">1Y return &gt; volatility</Label>
                  <Switch
                    id="retvol"
                    checked={cfg.annual_return_above_volatility === "yes"}
                    onCheckedChange={(c) =>
                      patch({ annual_return_above_volatility: c ? "yes" : "no" })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>% positive days (1Y / 6M / 3M)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      value={cfg.percentage_positive_days_one_year}
                      onChange={(e) =>
                        patch({ percentage_positive_days_one_year: Number(e.target.value) || 0 })
                      }
                    />
                    <Input
                      type="number"
                      value={cfg.percentage_positive_days_six_months}
                      onChange={(e) =>
                        patch({ percentage_positive_days_six_months: Number(e.target.value) || 0 })
                      }
                    />
                    <Input
                      type="number"
                      value={cfg.percentage_positive_days_three_months}
                      onChange={(e) =>
                        patch({ percentage_positive_days_three_months: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max circuit days (1Y)</Label>
                  <Input
                    type="number"
                    value={cfg.exclude_stocks_with_circuits_one_year}
                    onChange={(e) =>
                      patch({
                        exclude_stocks_with_circuits_one_year: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apply filters on</Label>
                  <NativeSelect
                    value={cfg.apply_filters_on}
                    onChange={(v) => patch({ apply_filters_on: v as "all" | "ranked" })}
                    options={[
                      { value: "all", label: "All stocks (pre-rank)" },
                      { value: "ranked", label: "Ranked list only" },
                    ]}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="beta">Ignore top 10% beta</Label>
                  <Switch
                    id="beta"
                    checked={cfg.ignore_top_beta === "yes"}
                    onCheckedChange={(c) => patch({ ignore_top_beta: c ? "yes" : "no" })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="sync">Sync NSE data on run</Label>
                  <Switch
                    id="sync"
                    checked={cfg.sync_data}
                    onCheckedChange={(c) => patch({ sync_data: c })}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <Button className="w-full" onClick={runScreen} disabled={loading}>
              {loading ? "Running screen…" : "Run momentum screen"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              {result?.index_label ? `${result.index_label} · sorted by ${sortLabel}` : "Run a screen to see rankings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">
                Fetching bhavcopy and computing factors… This can take several minutes the first
                time.
              </p>
            )}
            {result?.error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {result.error}
              </p>
            )}
            {result?.warning && !result.error && (
              <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-950 dark:text-amber-100">
                {result.warning}
              </p>
            )}
            {result && !result.error && (
              <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                {result.as_of && <Badge variant="secondary">As of {result.as_of}</Badge>}
                {result.universe_count != null && (
                  <Badge variant="outline">Universe {result.universe_count}</Badge>
                )}
                {result.evaluated != null && (
                  <Badge variant="outline">With data {result.evaluated}</Badge>
                )}
                {result.sync?.fetched_days != null && result.sync.fetched_days > 0 && (
                  <Badge variant="outline">
                    Synced {result.sync.fetched_days}
                    {result.sync.lookback_requested != null
                      ? ` / ${result.sync.lookback_requested} days`
                      : ""}{" "}
                    bhavcopy
                  </Badge>
                )}
                {result.ranked_with_primary != null && (
                  <Badge variant="outline">{result.ranked_with_primary} with sort value</Badge>
                )}
              </div>
            )}
            <ScrollArea className="h-[min(70vh,640px)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Close</TableHead>
                    <TableHead className="text-right">Primary factor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(result?.rows ?? []).map((r) => (
                    <TableRow key={r.symbol}>
                      <TableCell>{r.rank}</TableCell>
                      <TableCell className="font-medium">{r.symbol}</TableCell>
                      <TableCell className="text-right">{r.close?.toFixed(2) ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmtNum(r.primary)}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && (result?.rows?.length ?? 0) === 0 && !result?.error && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No rows yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
            <p className="mt-3 text-xs text-muted-foreground">
              P/E and market cap sorts need fundamentals (not in bhavcopy) and rank as empty until
              enriched. Not investment advice.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
