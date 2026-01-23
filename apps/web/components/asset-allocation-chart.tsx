'use client';

import * as React from 'react';
import { Cell, Label, Pie, PieChart, ResponsiveContainer, Sector } from 'recharts';
import { PieSectorDataItem } from 'recharts/types/polar/Pie';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface AssetData {
  asset: string;
  total: number;
  percentage: number;
}

interface AssetAllocationChartProps {
  selectedExchange: string;
  refreshInterval?: number;
}

// Professional color palette for financial charts
const CHART_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#84CC16', // Lime
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#A855F7', // Purple
];

export function AssetAllocationChart({
  selectedExchange,
  refreshInterval = 10000,
}: AssetAllocationChartProps) {
  const [assets, setAssets] = React.useState<AssetData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
  const [totalValue, setTotalValue] = React.useState(0);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/portfolio/assets?exchange=${selectedExchange}&minValue=1`,
        );

        if (response.ok) {
          const data = await response.json();
          // Get aggregated assets and take top 10 for chart clarity
          const topAssets = data.aggregatedAssets?.slice(0, 10) || [];

          // Group remaining assets as "Others" if there are more than 10
          if (data.aggregatedAssets?.length > 10) {
            const othersTotal = data.aggregatedAssets
              .slice(10)
              .reduce((sum: number, a: AssetData) => sum + a.total, 0);
            const othersPercentage = data.aggregatedAssets
              .slice(10)
              .reduce((sum: number, a: AssetData) => sum + a.percentage, 0);

            if (othersTotal > 0) {
              topAssets.push({
                asset: 'Others',
                total: othersTotal,
                percentage: othersPercentage,
              });
            }
          }

          setAssets(topAssets);
          setTotalValue(data.summary?.totalValue || 0);
        }
      } catch (error) {
        console.error('Failed to fetch asset allocation:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [selectedExchange, refreshInterval]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const renderActiveShape = (props: PieSectorDataItem) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload } =
      props;

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={(outerRadius || 0) + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          stroke={fill}
          strokeWidth={2}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={(outerRadius || 0) + 12}
          outerRadius={(outerRadius || 0) + 14}
          fill={fill}
        />
        <text
          x={cx}
          y={(cy || 0) - 10}
          textAnchor="middle"
          fill="hsl(var(--foreground))"
          className="text-base font-semibold"
        >
          {(payload as AssetData).asset}
        </text>
        <text
          x={cx}
          y={(cy || 0) + 10}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          className="text-sm"
        >
          {formatCurrency((payload as AssetData).total)}
        </text>
        <text
          x={cx}
          y={(cy || 0) + 28}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
          className="text-xs"
        >
          {formatPercentage((payload as AssetData).percentage)}
        </text>
      </g>
    );
  };

  if (loading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <Skeleton className="h-[300px] w-[300px] rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (assets.length === 0) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle>Asset Allocation</CardTitle>
          <CardDescription>Portfolio distribution by asset</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[350px] items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No assets found</p>
            <p className="text-sm">Connect an exchange to see your portfolio</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Asset Allocation</CardTitle>
        <CardDescription>
          {selectedExchange === 'all'
            ? 'Portfolio distribution across all exchanges'
            : `Portfolio distribution on ${selectedExchange}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col @lg/card:flex-row gap-6">
          {/* Pie Chart */}
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={assets}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="asset"
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  animationDuration={500}
                  animationEasing="ease-out"
                >
                  {assets.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
                  {activeIndex === undefined && (
                    <Label
                      content={({ viewBox }) => {
                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                          return (
                            <text
                              x={viewBox.cx}
                              y={viewBox.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) - 8}
                                className="fill-foreground text-xl font-bold"
                              >
                                {formatCurrency(totalValue)}
                              </tspan>
                              <tspan
                                x={viewBox.cx}
                                y={(viewBox.cy || 0) + 14}
                                className="fill-muted-foreground text-xs"
                              >
                                Total Value
                              </tspan>
                            </text>
                          );
                        }
                        return null;
                      }}
                    />
                  )}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 flex flex-col gap-2 min-w-[200px]">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Top Holdings
            </div>
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2">
              {assets.map((asset, index) => (
                <div
                  key={asset.asset}
                  className={`flex items-center justify-between p-2 rounded-md transition-colors cursor-pointer ${
                    activeIndex === index ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{
                        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                      }}
                    />
                    <span className="font-medium text-sm">{asset.asset}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium tabular-nums">
                      {formatCurrency(asset.total)}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPercentage(asset.percentage)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
