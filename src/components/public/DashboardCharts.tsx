"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { THEME_CONFIGS, type ThemeTokens } from "./design-tokens";
import { PublicEmptyState } from "./PublicEmptyState";
import {
  normalizeAnnualCountSeries,
  normalizeAnnualPublicationSeries,
} from "./slideshow-engine";

interface AnnualGraduateChartProps {
  byGraduationYear: ReadonlyArray<{ year: number; count: number }>;
  themeTokens?: ThemeTokens;
}

export function AnnualGraduateChart({
  byGraduationYear,
  themeTokens = THEME_CONFIGS.LIGHT,
}: AnnualGraduateChartProps) {
  const chartData = normalizeAnnualCountSeries(byGraduationYear);
  const colors = themeTokens.chart;

  if (chartData.length === 0) {
    return (
      <PublicEmptyState
        compact
        title="Belum Ada Statistik Kelulusan Tahunan"
        description="Grafik tren lulusan per tahun akan muncul otomatis setelah data kelulusan diterbitkan."
        themeTokens={themeTokens}
      />
    );
  }

  return (
    <div
      aria-label="Grafik Tren Kelulusan Tahunan"
      className="min-h-[180px] w-full flex-1"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 24, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.gridStroke}
            vertical={false}
          />
          <XAxis
            dataKey="year"
            stroke={colors.axisText}
            tick={{ fill: colors.axisText, fontSize: 13 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke={colors.axisText}
            tick={{ fill: colors.axisText, fontSize: 13 }}
            tickLine={false}
            width={36}
          />
          <Bar
            dataKey="count"
            name="Jumlah Lulusan"
            fill={colors.graduatesBar}
            radius={[3, 3, 0, 0]}
            maxBarSize={52}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="count"
              position="top"
              fill={colors.axisText}
              fontSize={13}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface AnnualPublicationChartProps {
  byYearAndKind: ReadonlyArray<{
    year: number;
    journalCount: number;
    articleCount: number;
    total: number;
  }>;
  themeTokens?: ThemeTokens;
}

export function AnnualPublicationChart({
  byYearAndKind,
  themeTokens = THEME_CONFIGS.LIGHT,
}: AnnualPublicationChartProps) {
  const chartData = normalizeAnnualPublicationSeries(byYearAndKind);
  const colors = themeTokens.chart;

  if (chartData.length === 0) {
    return (
      <PublicEmptyState
        compact
        title="Belum Ada Statistik Publikasi Tahunan"
        description="Grafik tren jurnal dan artikel ilmiah per tahun akan muncul otomatis setelah publikasi diterbitkan."
        themeTokens={themeTokens}
      />
    );
  }

  return (
    <div
      aria-label="Grafik Tren Publikasi Ilmiah Tahunan"
      className="min-h-[180px] w-full flex-1"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 24, right: 16, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={colors.gridStroke}
            vertical={false}
          />
          <XAxis
            dataKey="year"
            stroke={colors.axisText}
            tick={{ fill: colors.axisText, fontSize: 13 }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            stroke={colors.axisText}
            tick={{ fill: colors.axisText, fontSize: 13 }}
            tickLine={false}
            width={36}
          />
          <Legend
            verticalAlign="top"
            height={32}
            wrapperStyle={{
              fontSize: "13px",
              color: colors.axisText,
              fontWeight: 600,
            }}
          />
          <Bar
            dataKey="journalCount"
            name="Jurnal Ilmiah"
            fill={colors.journalBar}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="journalCount"
              position="top"
              fill={colors.axisText}
              fontSize={12}
              fontWeight={700}
            />
          </Bar>
          <Bar
            dataKey="articleCount"
            name="Artikel Ilmiah"
            fill={colors.articleBar}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="articleCount"
              position="top"
              fill={colors.axisText}
              fontSize={12}
              fontWeight={700}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
