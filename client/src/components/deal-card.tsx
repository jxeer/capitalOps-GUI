/**
 * DealCard Component
 * 
 * Purpose:
 * Displays a visually rich deal summary card for real estate investment deals,
 * featuring funding progress visualization, financial metrics, and deal terms.
 * 
 * Key Features:
 * - Circular SVG progress indicator showing funding percentage
 * - Dynamic header color based on funding status (funded, almost funded, in progress)
 * - Financial details display (target, raised, return profile, duration, risk)
 * - Optional investor match indicator
 * - Conditional CTA button text based on funding status
 * - Hover animations for interactivity feedback
 * 
 * Design Decisions:
 * - Uses SVG for circular progress (more control than CSS-based approaches)
 * - Progress colors: green (>=100%), amber (75-99%), primary blue (<75%)
 * - Card scales up slightly on hover (1.02) with shadow elevation
 * - Gradient header strip provides visual funding status at a glance
 * 
 * Security Considerations:
 * - No direct security implications; purely presentational
 * - Data should be validated server-side before rendering
 * - All currency formatting handled by formatCurrency utility
 * 
 * Usage:
 * <DealCard
 *   deal={dealData}
 *   project={relatedProject}
 *   asset={relatedAsset}
 *   matchedInvestors={investorMatches}
 *   progress={calculatedProgress}
 *   onView={() => navigateToDeal()}
 *   onInvest={() => openInvestmentModal()}
 * />
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, getStatusColor } from "@/lib/formatters";
import { Handshake, TrendingUp, Clock, Users, ArrowRight, Target, Shield, Send } from "lucide-react";
import type { Deal, Project, Asset, Investor } from "@shared/schema";

/**
 * Props for DealCard component.
 * @interface DealCardProps
 * @property deal - The deal data to display
 * @property project - Optional related project for additional context
 * @property asset - Optional related asset for location/type info
 * @property matchedInvestors - Optional array of matched investors for display
 * @property progress - Funding progress percentage (0-100+)
 * @property onView - Callback when card is clicked (view details)
 * @property onInvest - Callback when invest button is clicked
 * @property testId - Optional test ID for automated testing
 */
interface DealCardProps {
  deal: Deal;
  project?: Project;
  asset?: Asset;
  matchedInvestors?: Investor[];
  progress: number;
  onView?: () => void;
  onInvest?: () => void;
  testId?: string;
}

/**
 * DealCard displays a real estate deal with funding progress and key metrics.
 * 
 * Visual Structure:
 * 1. Colored header strip (funding status indicator)
 * 2. Title + status badge
 * 3. Circular progress gauge
 * 4. Financial details (target, raised, progress bar)
 * 5. Deal terms grid (return profile, duration, risk, complexity)
 * 6. Optional investor match indicator
 * 7. CTA button
 * 
 * @param deal - Deal data object
 * @param project - Optional project reference
 * @param asset - Optional asset reference
 * @param matchedInvestors - Optional matched investors array
 * @param progress - Funding percentage
 * @param onView - Card click handler
 * @param onInvest - Invest button click handler
 * @param testId - Test identifier for E2E tests
 */
export function DealCard({ 
  deal, 
  project, 
  asset, 
  matchedInvestors, 
  progress, 
  onView, 
  onInvest, 
  testId 
}: DealCardProps) {
  // Derive deal display name from multiple sources with fallback chain
  const dealName = (deal as any).projectName || project?.phase || deal.phase || "Unnamed Deal";
  
  // Funding status thresholds for visual styling
  const isFullyFunded = progress >= 100;
  const isAlmostFunded = progress >= 75 && progress < 100;

  return (
    <Card
      className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] cursor-pointer"
      data-testid={testId}
      onClick={onView}
    >
      {/*
        Gradient header strip:
        - Green gradient: Fully funded (>=100%)
        - Amber gradient: Almost funded (75-99%)
        - Blue gradient: In progress (<75%)
      */}
      <div className={`h-2 w-full ${
        isFullyFunded 
          ? 'bg-gradient-to-r from-chart-2 to-emerald-400' 
          : isAlmostFunded 
            ? 'bg-gradient-to-r from-chart-3 to-amber-400' 
            : 'bg-gradient-to-r from-primary to-blue-400'
      }`} />

      <CardContent className="p-5">
        {/* Header: Deal name, type/location, and status badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            {/* Deal name with handshake icon */}
            <div className="flex items-center gap-2 mb-1">
              <Handshake className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold truncate">{dealName}</span>
            </div>
            {/* Asset type and location as subtitle */}
            <p className="text-xs text-muted-foreground truncate">
              {asset?.name || asset?.assetType || "Mixed-Use Development"} • {asset?.location || "Location TBD"}
            </p>
          </div>
          {/* Deal status badge with color coding */}
          <Badge 
            variant="secondary" 
            className={`${getStatusColor(deal.status)} shrink-0`}
          >
            {deal.status}
          </Badge>
        </div>

        {/* Circular Progress Indicator */}
        {/*
          SVG-based circular progress:
          - Outer circle: muted background ring
          - Inner circle: colored progress arc
          - strokeDasharray calculation: progress * 3.02 approximates circumference (2 * PI * 48 ≈ 301.6)
          - Transform rotate-90: starts arc at top instead of right
        */}
        <div className="flex items-center justify-center mb-5">
          <div className="relative">
            {/* Outer ring: background track */}
            <svg className="w-28 h-28 transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth="8"
                opacity="0.3"
              />
              {/* Progress arc: colored based on funding status */}
              <circle
                cx="56"
                cy="56"
                r="48"
                fill="none"
                stroke={isFullyFunded ? "#10b981" : isAlmostFunded ? "#f59e0b" : "hsl(var(--primary))"}
                strokeWidth="8"
                strokeLinecap="round"
                // Progress value mapped to arc length (circumference ≈ 301.6)
                strokeDasharray={`${progress * 3.02} 301.6`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            {/* Center: percentage text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold">{progress}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Funded</span>
            </div>
          </div>
        </div>

        {/* Financial Details Section */}
        <div className="space-y-3 mb-4">
          {/* Target amount */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Target</span>
            <span className="font-semibold">{formatCurrency(deal.capitalRequired)}</span>
          </div>
          {/* Raised amount (green if fully funded) */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Raised</span>
            <span className={`font-semibold ${isFullyFunded ? 'text-chart-2' : ''}`}>
              {formatCurrency(deal.capitalRaised)}
            </span>
          </div>
          {/* Linear progress bar as secondary indicator */}
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Deal Terms Grid: 2x2 layout of key metrics */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {/* Return profile */}
          <div className="flex items-center gap-1.5 text-xs">
            <Target className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{deal.returnProfile}</span>
          </div>
          {/* Investment duration */}
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{deal.duration}</span>
          </div>
          {/* Risk level */}
          <div className="flex items-center gap-1.5 text-xs">
            <Shield className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{deal.riskLevel} Risk</span>
          </div>
          {/* Deal complexity */}
          <div className="flex items-center gap-1.5 text-xs">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{deal.complexity}</span>
          </div>
        </div>

        {/* Investor Match Indicator: shown only when matches exist */}
        {matchedInvestors && matchedInvestors.length > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-chart-2/10 mb-4">
            <Users className="h-3.5 w-3.5 text-chart-2" />
            <span className="text-xs text-chart-2 font-medium">
              {matchedInvestors.length} matched investors
            </span>
          </div>
        )}

        {/* CTA Button: text changes based on funding status */}
        {/*
          stopPropagation prevents card onClick when button is clicked.
          This allows separate actions for card click vs button click.
        */}
        <Button
          className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onInvest?.();
          }}
        >
          <span className="flex items-center gap-2">
            {isFullyFunded ? 'View Details' : 'View Deal'}
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}
