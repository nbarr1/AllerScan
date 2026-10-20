# Accessibility Statement & Guidelines

AllerScan is committed to providing an accessible experience for all users, including individuals with visual, motor, cognitive, and sensory impairments. We target compliance with the Web Content Accessibility Guidelines (**WCAG 2.1 Level AA**) across both web and native mobile interfaces.

---

## Design & Technical Standards

### 1. Visual & Color Design
- **Contrast Ratios**: All body text maintains a minimum visual contrast ratio of $4.5:1$ against its background. Large headers and interactive control elements maintain at least a $3:1$ ratio.
- **Multi-Modal Indicators**: Risk indicators, allergen badges, and pollen heatmaps do not rely solely on color encoding. Text labels, iconography, and distinct shape badges accompany color scales.

### 2. Native Android Interface (Jetpack Compose)
- **Touch Targets**: All buttons, cards, and interactive chips maintain a minimum touch target size of $48 \times 48\text{ dp}$.
- **Screen Reader Support**: All image elements, status icons, and camera controls include explicit `contentDescription` attributes for TalkBack.
- **Dynamic Text Scaling**: Native Jetpack Compose screens support system font scaling without text clipping or UI fragmentation.

### 3. Web & Cross-Platform UI (React / Tailwind)
- **Semantic HTML**: Views (`ScanView`, `ProfileView`, `DashboardView`) are structured with semantic HTML5 landmarks (`<header>`, `<main>`, `<nav>`, `<section>`).
- **Keyboard Navigation**: All visual controls, navigation items, and modal dialogs are navigable via standard `Tab` / `Shift+Tab` sequences with visible focus indicators (`focus-visible`).
- **Screen Reader Announcements**: Dynamic updates, environmental alerts, and scan results use ARIA live regions (`aria-live="polite"`).

---

## Pre-Commit Accessibility Verification Checklist

Before submitting pull requests with UI changes, verify accessibility compliance with this checklist:

- [ ] **Keyboard Navigability**: Can every button, form input, and modal be operated using `Tab`, `Space`, and `Enter`?
- [ ] **Screen Reader Audit**: Tested with TalkBack (Android) or VoiceOver (iOS/macOS). Are status updates and risk matches clearly announced?
- [ ] **Target Sizing**: Are touch targets at least $48 \times 48\text{ dp}$ (Android) or $44 \times 44\text{ px}$ (Web)?
- [ ] **Focus Management**: Do overlay components (`OnboardingModal`, `InstallAppModal`, `NotificationDrawer`) trap focus correctly while open and return focus upon closing?

---

## Feedback & Accessibility Issues

If you encounter accessibility barriers when using AllerScan, please open an issue tagged with the `accessibility` label on GitHub or email `accessibility@allerscan.app` with:
- A description of the issue and the affected page or view.
- Assistive technology used (e.g., TalkBack, VoiceOver, NVDA, screen magnifier).
- Operating system and device model.
