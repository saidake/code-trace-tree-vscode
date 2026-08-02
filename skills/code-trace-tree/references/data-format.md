# Code Trace Tree data format

Root document (`version="4"`) stored as `<OS Config Dir>/code-trace-tree/<projectId>.xml`.
Legacy `<FolderName>.xml` files are still resolved by scanning `<projectId>` inside XML.

`<!-- … -->` comments below are for documentation only; prefer omitting them in real storage files.
Prefer `trace_tree` scripts over hand-editing. Never persist `isValid`.

## Annotated full example

Shows project flags, **two profiles** (`main` + `AGENT`), nested `LINE` → `FILE` / `DIRECTORY`
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
  <!-- Agent Notes: false/missing → agents must not auto-sync -->
  <claudeAssistEnabled>true</claudeAssistEnabled>
  <!-- CURRENT = edit activeProfileName; AGENT = edit/create profile named AGENT -->
  <claudeAssistTarget>AGENT</claudeAssistTarget>

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

    <!-- Profile 2: dedicated Agent Notes tree (when claudeAssistTarget is AGENT) -->
    <traceProfile>
      <name>AGENT</name>
      <tracePointNodes>
        <tracePointNode>
          <id>b3333333-3333-4333-8333-333333333333</id>
          <parentId />
          <tracePoint>
            <traceName>agent topic root</traceName>
            <traceType>LINE</traceType>
            <baseName>CheckoutService.java</baseName>
            <tracePath>src/main/java/com/example/CheckoutService.java</tracePath>
            <lineNumber>12</lineNumber>
            <lineContent>public void checkout(Order order) {</lineContent>
            <totalOccurrences>1</totalOccurrences>
            <occurrenceIndex>1</occurrenceIndex>
            <description>topic notes for the current agent discussion</description>
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
  <claudeAssistEnabled>false</claudeAssistEnabled>
  <claudeAssistTarget>CURRENT</claudeAssistTarget>
  <traceProfiles>
    <traceProfile>
      <name>main</name>
      <tracePointNodes><!-- roots --></tracePointNodes>
      <expandedTracePointIds>
        <id>uuid</id>
      </expandedTracePointIds>
    </traceProfile>
    <!-- Optional additional profiles, e.g. <name>AGENT</name> -->
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
| `isValid` | Never persist (runtime-only) |

## `isValid` (runtime)

| Kind | Valid when |
|------|------------|
| `LINE` | File exists; trimmed line at `lineNumber` matches `lineContent`, or occurrence rebinding succeeds (`totalOccurrences` / `occurrenceIndex`) |
| `FILE` | Path exists and is a file |
| `DIRECTORY` | Path exists and is a directory |

Line comparisons always use trimmed text: `documentLine.trim() == lineContent.trim()`.

For agent-written `LINE` nodes:

1. Prefer `scripts/trace_tree.py` (`add` / `move` / `delete` / `rebind`) with locator `[file, content]` or `[file, line, content]` — do **not** pass occurrence fields. For parents, prefer repeated `--parent-id` over `--parent` JSON.
2. The script stores **trimmed** `lineContent`, verifies the line text, then sets `totalOccurrences` / `occurrenceIndex` by scanning the file.
3. When the same trimmed text appears more than once in a file, pass `--line` / `[file, line, content]`. Idempotent add keys on file + content + `occurrenceIndex`, so each occurrence can be a separate node.
4. After agent edits source on disk, run `trace_tree rebind` so `lineNumber` tracks moved content (IDE DocumentListener does not see agent edits).
5. If editing XML by hand: count matching trimmed lines → `totalOccurrences`; set `occurrenceIndex` (1-based) for the intended `lineNumber`.

## Agent Notes flags

UI label is **Agent Notes**. XML element names keep the historical `claudeAssist*` prefix.

| Element | Values | Meaning |
|---------|--------|---------|
| `claudeAssistEnabled` | `true` / `false` (default `false`) | When true, an external agent may auto-sync topic-related traces |
| `claudeAssistTarget` | `CURRENT` (default) or `AGENT` | Write into `<activeProfileName>`, or the dedicated profile named **`AGENT`** |

Do **not** write `CLAUDE` as a target or profile name. Older files may still contain `CLAUDE`; the IDE and `trace_tree` migrate that to `AGENT` on load. Missing elements mean assist is off and target is `CURRENT`.

## Import/export

- Single profile: root `<traceProfile>`
- Multi profile: root `<traceProfiles>` with `<activeProfileName>` + multiple `<traceProfile>`

Same `<traceType>` rules as the global store. Prefer editing the **global project XML** unless the user asks for an export file.
