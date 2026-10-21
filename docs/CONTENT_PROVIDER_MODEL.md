# Content Provider Model

**Status:** Proposed  
**Last updated:** 2026-10-20

## Purpose

NovoApps Learning and CMS should support multiple content providers.

New Vines International is the initial provider but should not be hard-coded as the only possible owner of educational content.

---

# 1. Conceptual Hierarchy

```text
Content Provider
   ↓
Program / Catalog
   ↓
Course
   ↓
Module
   ↓
Page
   ↓
Content Block
```

A provider may publish multiple courses.

The Learning runtime should consume provider metadata from the published content package rather than assume New Vines branding.

---

# 2. Example

```text
Provider:
New Vines International

Program:
Managing Personal Money

Course:
Foundations of Godly Money Management
```

Future example:

```text
Provider:
Partner Agricultural Ministry

Program:
Small Farm Training

Course:
Post-Harvest Crop Management
```

The same CMS and Learning runtime should support both.

---

# 3. Provider Entity

Possible fields:

```text
id
name
slug
status
defaultLocale
logoAssetId
brandingConfig
website
supportContact
createdAt
updatedAt
```

A provider should receive a stable UUID.

Do not use a display name as a technical identifier.

---

# 4. Course Ownership

Each course belongs to a provider.

Possible relation:

```text
Course
------
id
providerId
title
slug
canonicalLocale
status
currentVersion
```

Provider membership may eventually determine which CMS users may edit or publish provider content.

---

# 5. Branding

Provider branding should be configuration/data, not hard-coded Learning UI logic.

Possible publish metadata:

```json
{
  "provider": {
    "id": "nvi",
    "name": "New Vines International",
    "logo": "assets/provider-logo.webp",
    "theme": {
      "brandKey": "nvi-default"
    }
  }
}
```

The exact theme system can remain simple initially.

---

# 6. Canonical Content

Every course should identify its canonical source locale.

Example:

```text
en-global
```

Translations/localizations reference canonical content.

Provider ownership does not change the requirement that source content, translations, and localized variants remain distinguishable.

---

# 7. Provider-Level Roles

Potential future roles:

```text
Provider Owner
Provider Administrator
Content Editor
Translator
Reviewer
Publisher
Viewer
```

Avoid implementing all roles initially.

Start with the minimum required workflow and expand as real needs appear.

---

# 8. Publishing Boundary

Published course packages should include enough provider information for the Learning runtime to present correct identity/branding.

The runtime should not query CMS tables at display time.

---

# 9. Platform Versus Provider Naming

Architecturally:

```text
NovoApps
```

is the software/platform.

```text
New Vines International
```

is a content provider and organization using that software.

This distinction should influence:

- Folder names
- Database schemas
- API naming
- Published content format
- CMS permissions

It does not require changing public product branding immediately.
