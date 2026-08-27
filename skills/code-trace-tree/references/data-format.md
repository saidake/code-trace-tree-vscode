# Code Trace Tree data format

Prefer `trace_tree` scripts over hand-editing. Use this file when scripts fail, storage looks corrupt, or you must inspect or edit XML. Never persist `isValid`.

`<!-- … -->` comments below are for documentation only; prefer omitting them in real storage files.

## Storage layout

| Piece | Location |
|-------|----------|
| Project id | Prefer `.idea/code-trace-tree.project.id` when present; else path match to global XML `<path>` / `<projectId>` (never write the `.idea` file) |
| Global XML | `<OS Config Dir>/code-trace-tree/` — `<ProjectFolderName>.xml` on lazy create; legacy `<projectId>.xml` and folder-named files resolved by scanning XML |
| Storage-ready (Case C bind) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.storage-ready` (no TTL; written by refresh scripts) |
| Refresh signal (full) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.request_refresh` (TTL 60s) |
| Refresh signal (one profile) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.request_refresh_profile` (TTL 60s; body = profile name, empty → active) |
| Refresh signal (settings) | `<OS Config Dir>/code-trace-tree/signals/<projectId>.request_refresh_settings` (TTL 60s) |
| Select signal | `<OS Config Dir>/code-trace-tree/signals/<projectId>.select_trace_points` (one UUID per line; TTL 60s) |

**OS Config Dir:**

- Windows: `%LOCALAPPDATA%`
- macOS: `~/Library/Application Support`
- Linux: `$XDG_CONFIG_HOME` or `~/.config`

**Resolve / init:** If `.idea/code-trace-tree.project.id` already exists, use that id and
its global XML (do not create a second project). If the id exists but XML is missing,
recreate XML with **that same** projectId (do not mint a new id). Else bind by XML
`<path>`. **Case C** (nothing found): create initial global XML with `<path>` only —
never create/write the `.idea` id file. Pass / resolve the project root so `<path>` is
correct; IDE binds via path match + `storage-ready`. Scripts: `resolve_storage.py`,
`init_storage.py`; mutating `trace_tree` (`add` / `ensure` / `move` / `delete` / `rebind`) auto-inits.

## Signals

The IDE watches **signal files** (not the XML path). Refresh/select scripts write these.

| Signal | Effect |
|--------|--------|
| `request_refresh` | Full reload: all profiles, active profile, toolbar flags (`highlightingEnabled`, `namePromptEnabled`, `descriptionAreaOpened`, `advancedSettings`). Also writes `<projectId>.storage-ready` so an open Case C IDE can bind first. |
| `request_refresh_profile` | Reload one profile’s tree from XML into memory. Body = profile name (empty → active). Does **not** change active profile or toolbar flags. Also writes `storage-ready`. Structure ops (`add` / `ensure` / `move` / `delete` / `rebind`) emit this. |
| `request_refresh_settings` | Reload project toolbar flags / `advancedSettings` / `activeProfileName` only (not profile trees). |
| `<projectId>.storage-ready` | Case C bind handshake (no TTL). Body = absolute project path (same as XML `<path>`). IDE filters on the body first; empty/legacy body falls back to XML `<path>`. Does not create storage. |
| `select_trace_points` | One node UUID per line. Every open IDE window for that project selects / reveals those nodes. |

Bound windows watch the shared global signals folder for that projectId. Unbound (Case C) windows watch `signals/*.storage-ready` until they bind. Refresh/select files older than 60s are ignored and removed; `storage-ready` has no TTL (agent overwrites).

## Annotated full example

Shows project flags, **two profiles** (`main` + `checkout`), nested `LINE` → `FILE` / `DIRECTORY`
children in `main`, and a second `LINE` tip for the same trimmed text at a different
occurrence (`occurrenceIndex`). Profiles are independent trees; node ids must be unique
within a profile (prefer globally unique UUIDs).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- version="4" is required; bump updatedAt (epoch ms) when you change content -->
<project version="4">
  <!-- Bound id; global file is normally <projectId>.xml -->
  <projectId>9a8b7c6d-5e4f-4a1b-8c2d-1e0f9a8b7c6d</projectId>
  <!-- Absolute project root; IDE may refresh this on open after moves/renames -->
  <path>/Users/dev/code/MyProject</path>
  <updatedAt>1722340000000</updatedAt>
  <!-- Profile shown in the tool window (must match a <traceProfile><name>) -->
  <activeProfileName>main</activeProfileName>
  <highlightingEnabled>true</highlightingEnabled>
  <namePromptEnabled>true</namePromptEnabled>
  <!-- Optional; omit when colors are still defaults (#FFFFC8 / #646400) -->
  <advancedSettings>
    <highlightLineBackground>
      <light>#FFFFC8</light>
      <dark>#646400</dark>
    </highlightLineBackground>
  </advancedSettings>

  <traceProfiles>
    <!-- Profile 1: user / default tree -->
    <traceProfile>
      <name>main</name>
      <tracePointNodes>
        <!-- Root LINE node: empty parentId -->
        <tracePointNode>
          <id>16db1ed5-1ad4-4cdc-8323-ab1c943365e9</id>
          <parentId />
          <tracePoint>
            <traceName>entry</traceName>
            <traceType>LINE</traceType>
            <baseName>TestController.java</baseName>
            <!-- Paths are relative to project root; prefer forward slashes -->
            <tracePath>src/main/java/com/example/TestController.java</tracePath>
            <lineNumber>29</lineNumber>
            <!-- Always store trimmed line text -->
            <lineContent>log.info("id: {}", id);</lineContent>
            <totalOccurrences>1</totalOccurrences>
            <occurrenceIndex>1</occurrenceIndex>
          </tracePoint>
          <children>
            <!-- Child FILE: parentId must equal parent node id -->
            <tracePointNode>
              <id>04396f8c-fd1f-442b-90e0-9b0e3ba9403a</id>
              <parentId>16db1ed5-1ad4-4cdc-8323-ab1c943365e9</parentId>
              <tracePoint>
                <traceName>service</traceName>
                <traceType>FILE</traceType>
                <baseName>OrderService.java</baseName>
                <tracePath>src/main/java/com/example/OrderService.java</tracePath>
                <!-- Optional; omit the element when empty -->
                <description>order domain service</description>
              </tracePoint>
            </tracePointNode>
            <!-- Child DIRECTORY -->
            <tracePointNode>
              <id>e5f04226-270e-444f-9f6d-f41b8b509ade</id>
              <parentId>16db1ed5-1ad4-4cdc-8323-ab1c943365e9</parentId>
              <tracePoint>
                <traceName>dto package</traceName>
                <traceType>DIRECTORY</traceType>
                <baseName>dto</baseName>
                <tracePath>src/main/java/com/example/dto</tracePath>
              </tracePoint>
            </tracePointNode>
          </children>
        </tracePointNode>

        <!-- Another root LINE: same trimmed text appears twice in Helper.java -->
        <!-- Identity for agents/scripts: file + content + occurrenceIndex -->
        <tracePointNode>
          <id>a1111111-1111-4111-8111-111111111111</id>
          <parentId />
          <tracePoint>
            <traceName>flag call site 1</traceName>
            <traceType>LINE</traceType>
            <baseName>Helper.java</baseName>
            <tracePath>src/main/java/com/example/Helper.java</tracePath>
            <lineNumber>40</lineNumber>
            <lineContent>featureFlagService,</lineContent>
            <totalOccurrences>2</totalOccurrences>
            <occurrenceIndex>1</occurrenceIndex>
          </tracePoint>
        </tracePointNode>
        <tracePointNode>
          <id>a2222222-2222-4222-8222-222222222222</id>
          <parentId />
          <tracePoint>
            <traceName>flag call site 2</traceName>
            <traceType>LINE</traceType>
            <baseName>Helper.java</baseName>
            <tracePath>src/main/java/com/example/Helper.java</tracePath>
            <lineNumber>90</lineNumber>
            <lineContent>featureFlagService,</lineContent>
            <totalOccurrences>2</totalOccurrences>
            <occurrenceIndex>2</occurrenceIndex>
          </tracePoint>
        </tracePointNode>
      </tracePointNodes>
      <!-- Which nodes are expanded in the tree UI for this profile -->
      <expandedTracePointIds>
        <id>16db1ed5-1ad4-4cdc-8323-ab1c943365e9</id>
      </expandedTracePointIds>
    </traceProfile>

    <!-- Profile 2: optional second profile (any name) -->
    <traceProfile>
      <name>checkout</name>
      <tracePointNodes>
        <tracePointNode>
          <id>b3333333-3333-4333-8333-333333333333</id>
          <parentId />
          <tracePoint>
            <traceName>checkout entry</traceName>
            <traceType>LINE</traceType>
            <baseName>CheckoutService.java</baseName>
            <tracePath>src/main/java/com/example/CheckoutService.java</tracePath>
            <lineNumber>12</lineNumber>
            <lineContent>public void checkout(Order order) {</lineContent>
            <totalOccurrences>1</totalOccurrences>
            <occurrenceIndex>1</occurrenceIndex>
            <description>checkout flow entry</description>
          </tracePoint>
          <children>
            <tracePointNode>
              <id>b4444444-4444-4444-8444-444444444444</id>
              <parentId>b3333333-3333-4333-8333-333333333333</parentId>
              <tracePoint>
                <traceName>payment call</traceName>
                <traceType>LINE</traceType>
                <baseName>CheckoutService.java</baseName>
                <tracePath>src/main/java/com/example/CheckoutService.java</tracePath>
                <lineNumber>28</lineNumber>
                <lineContent>paymentClient.charge(order);</lineContent>
                <totalOccurrences>1</totalOccurrences>
                <occurrenceIndex>1</occurrenceIndex>
              </tracePoint>
            </tracePointNode>
          </children>
        </tracePointNode>
      </tracePointNodes>
      <expandedTracePointIds>
        <id>b3333333-3333-4333-8333-333333333333</id>
      </expandedTracePointIds>
    </traceProfile>
  </traceProfiles>

  <descriptionAreaOpened>true</descriptionAreaOpened>
</project>
```

## Project document (skeleton)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <projectId>uuid</projectId>
  <path>/absolute/project/root</path>
  <updatedAt>1722340000000</updatedAt>
  <activeProfileName>main</activeProfileName>
  <highlightingEnabled>true</highlightingEnabled>
  <namePromptEnabled>true</namePromptEnabled>
  <!-- Optional advancedSettings / highlightLineBackground (#RRGGBB light+dark) -->
  <traceProfiles>
    <traceProfile>
      <name>main</name>
      <tracePointNodes><!-- roots --></tracePointNodes>
      <expandedTracePointIds>
        <id>uuid</id>
      </expandedTracePointIds>
    </traceProfile>
    <!-- Optional additional profiles -->
  </traceProfiles>
  <descriptionAreaOpened>false</descriptionAreaOpened>
</project>
```

## Trace point kinds

Every `<tracePoint>` has `<traceType>`: `LINE` | `FILE` | `DIRECTORY`.

### LINE (editor caret)

```xml
<tracePoint>
  <traceName>optional label</traceName>
  <traceType>LINE</traceType>
  <baseName>Foo.java</baseName>
  <tracePath>src/main/java/Foo.java</tracePath>
  <lineNumber>29</lineNumber>
  <lineContent>exact line text (trimmed)</lineContent>
  <totalOccurrences>1</totalOccurrences>
  <occurrenceIndex>1</occurrenceIndex>
  <description>optional</description>
</tracePoint>
```

### FILE (Project View file)

```xml
<tracePoint>
  <traceName>optional label</traceName>
  <traceType>FILE</traceType>
  <baseName>Foo.java</baseName>
  <tracePath>src/main/java/Foo.java</tracePath>
  <description>optional</description>
</tracePoint>
```

### DIRECTORY (Project View folder)

```xml
<tracePoint>
  <traceName>optional label</traceName>
  <traceType>DIRECTORY</traceType>
  <baseName>dto</baseName>
  <tracePath>src/main/java/com/example/dto</tracePath>
  <description>optional</description>
</tracePoint>
```

## Node wrapper

```xml
<tracePointNode>
  <id>3d41c2d1-93ae-4ed3-b11d-f8a338bc388c</id>
  <parentId /><!-- empty for roots; otherwise parent uuid -->
  <tracePoint><!-- see above --></tracePoint>
  <children>
    <!-- nested tracePointNode elements -->
  </children>
</tracePointNode>
```

## Field notes

| Field | Notes |
|-------|--------|
| `traceName` | User label for the node |
| `traceType` | `LINE`, `FILE`, or `DIRECTORY` (required) |
| `baseName` | Last path segment (file or directory name) |
| `tracePath` | Relative to project root (file or directory) |
| `lineNumber` | 1-based; **LINE only** |
| `lineContent` | Trimmed line text; **LINE only** |
| `totalOccurrences` / `occurrenceIndex` | Disambiguate duplicate trimmed lines; **LINE only** |
| `description` | Optional for all kinds (`LINE`, `FILE`, `DIRECTORY`); omit element when empty |
| `isValid` | Never persist (runtime-only; recompute on load, file open, and Recheck Trace Availability) |

## `isValid` (runtime)

Never persist. Recompute on load/reload, when a file is opened (LINE nodes in that file, against the editor document), and when the user clicks Recheck Trace Availability (all LINE / FILE / DIRECTORY nodes). Persist `lineNumber` / occurrence fields only if rebind actually moved them.

| Kind | Valid when |
|------|------------|
| `LINE` | File exists; trimmed line at `lineNumber` matches `lineContent`, or occurrence rebinding succeeds (`totalOccurrences` / `occurrenceIndex`) |
| `FILE` | Path exists and is a file |
| `DIRECTORY` | Path exists and is a directory |

Line comparisons always use trimmed text: `documentLine.trim() == lineContent.trim()`.

For agent-written `LINE` nodes:

1. Prefer `scripts/trace_tree.py` (`add` / `ensure` / `move` / `delete` / `rebind`) with locator `[file, content]` or `[file, line, content]` — do **not** pass occurrence fields. For parents, prefer repeated `--parent-id` over `--parent` JSON. Prefer `ensure` for workflow trees; `add` always creates a new UUID.
2. The script stores **trimmed** `lineContent`, verifies the line text, then sets `totalOccurrences` / `occurrenceIndex` by scanning the file.
3. When the same trimmed text appears more than once in a file, pass `--line` / `[file, line, content]`. `ensure` identity is file + trimmed content + `occurrenceIndex`, so each occurrence can be a separate node.
4. After agent edits source on disk, run `trace_tree rebind` so `lineNumber` tracks moved content (IDE DocumentListener does not see agent edits).
5. If editing XML by hand: count matching trimmed lines → `totalOccurrences`; set `occurrenceIndex` (1-based) for the intended `lineNumber`.

## Edit rules

Hand-edit XML only when scripts cannot do the job. Prefer an atomic write (`*.xml.tmp`, then replace). Finish XML writes **before** `request_refresh.py`.

- Keep `<project version="4">`, `<projectId>`, and `<path>` unless you intentionally rebind storage.
- Prefer existing `.idea/code-trace-tree.project.id` when resolving; never create/overwrite it. If that id exists but XML is gone, recreate XML with the same projectId (Case C otherwise = new global XML + `<path>` only).
- Bump `<updatedAt>` to the current epoch milliseconds when you change content.
- Every `<tracePoint>` needs `<traceType>`: `LINE`, `FILE`, or `DIRECTORY`.
- `traceName` is the user label; `baseName` is the last path segment; `tracePath` is **relative to the project root** (forward slashes preferred).
- For `LINE`: store trimmed `lineContent` and 1-based `lineNumber`. Prefer `trace_tree` scripts so `totalOccurrences` / `occurrenceIndex` are computed automatically.
- For `FILE` / `DIRECTORY`: omit line fields; `tracePath` is the file or directory path.
- Every `<tracePointNode>` needs `<id>` (UUID) and `<parentId>` (empty for roots).
- Nest children under `<children>`; child `parentId` must equal the parent node id.
- Do **not** persist `isValid` (runtime-only).
- Do not delete unrelated profiles. Default profile name is `main`.

## Import/export

- Single profile: root `<traceProfile>`
- Multi profile: root `<traceProfiles>` with `<activeProfileName>` + multiple `<traceProfile>`

Same `<traceType>` rules as the global store. Prefer editing the **global project XML** unless the user asks for an export file.
