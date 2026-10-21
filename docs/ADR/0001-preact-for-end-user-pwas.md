# ADR 0001: Use Preact for End-User PWAs

**Status:** Accepted  
**Date:** 2026-10-20

## Context

New Vines end-user applications must work well on low-cost and older devices, often with unreliable or expensive internet access. Existing New Vines applications, including the Learning PWA and Inventory PWA, already use Preact, TypeScript, and Vite.

These applications need to remain lightweight, offline-first, and easy to deploy as installable PWAs.

## Decision

Use **Preact + TypeScript + Vite** as the standard front-end stack for end-user PWAs.

This applies to:

- Learning PWA
- Inventory PWA
- Finance/Budgeting PWA
- Future field-oriented New Vines PWAs

Preact applications may use custom lightweight UI components and shared TypeScript packages from the monorepo.

## Rationale

Preact provides:

- Small runtime size
- Fast startup on low-end devices
- Familiar React-like component model
- Good TypeScript support
- Excellent compatibility with Vite
- Strong fit for offline-first PWA use
- Continuity with the existing New Vines codebase

## Consequences

### Positive

- Smaller client bundles
- Faster load times
- Better suitability for rural and low-bandwidth environments
- Existing application code remains relevant
- Less unnecessary framework overhead on end-user devices

### Negative

- Some React-specific component libraries cannot be used directly
- Administrative applications may use a different UI framework

## Guardrail

Do not migrate an end-user PWA from Preact to React merely to standardize frameworks across the platform.

A migration requires an explicit architecture decision.
