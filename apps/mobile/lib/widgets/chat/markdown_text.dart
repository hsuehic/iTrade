import 'package:flutter/material.dart';

/// Minimal inline markdown renderer supporting:
///   **bold**, *italic*, `code`
///
/// Returns a [TextSpan] suitable for use with [RichText] or [Text.rich].
TextSpan renderMarkdownInline(String text, TextStyle baseStyle) {
  final spans = <TextSpan>[];
  // Matches **bold**, *italic*, `code`
  final regex = RegExp(r'\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`');
  int lastIndex = 0;

  for (final match in regex.allMatches(text)) {
    if (match.start > lastIndex) {
      spans.add(TextSpan(text: text.substring(lastIndex, match.start), style: baseStyle));
    }
    if (match.group(1) != null) {
      spans.add(TextSpan(
        text: match.group(1),
        style: baseStyle.copyWith(fontWeight: FontWeight.bold),
      ));
    } else if (match.group(2) != null) {
      spans.add(TextSpan(
        text: match.group(2),
        style: baseStyle.copyWith(fontStyle: FontStyle.italic),
      ));
    } else if (match.group(3) != null) {
      spans.add(TextSpan(
        text: match.group(3),
        style: baseStyle.copyWith(
          fontFamily: 'monospace',
          backgroundColor: Colors.grey.withValues(alpha: 0.2),
        ),
      ));
    }
    lastIndex = match.end;
  }
  if (lastIndex < text.length) {
    spans.add(TextSpan(text: text.substring(lastIndex), style: baseStyle));
  }

  return TextSpan(children: spans);
}

/// Returns true if [line] looks like a markdown table separator: |---|---|
bool _isTableSeparator(String line) =>
    RegExp(r'^\|[\s\-:|]+\|').hasMatch(line.trim());

/// Returns true if [line] is a markdown table row (starts and ends with |)
bool _isTableRow(String line) =>
    line.trim().startsWith('|') && line.trim().endsWith('|');

/// Parses a markdown table row into individual cell strings.
List<String> _parseTableCells(String line) {
  final trimmed = line.trim();
  // Strip leading and trailing |, then split on |
  return trimmed
      .substring(1, trimmed.length - 1)
      .split('|')
      .map((c) => c.trim())
      .toList();
}

/// Block-level markdown renderer. Supports:
///   - Headings (#, ##, ###)
///   - Unordered lists (- item, * item)
///   - Horizontal rules (---)
///   - Tables (| col | col |)
///   - Inline markdown (bold, italic, code)
///   - Regular paragraphs
///
/// Returns a [Column] of [Widget]s.
class MarkdownBlock extends StatelessWidget {
  final String text;
  final TextStyle? baseStyle;
  final Color? textColor;

  const MarkdownBlock({
    super.key,
    required this.text,
    this.baseStyle,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final defaultStyle = baseStyle ??
        theme.textTheme.bodyMedium!.copyWith(
          fontSize: 13,
          color: textColor ?? theme.colorScheme.onSurface,
          height: 1.45,
        );

    final lines = text.split('\n');
    final widgets = <Widget>[];
    int i = 0;

    while (i < lines.length) {
      final line = lines[i];

      // Heading
      final headingMatch = RegExp(r'^(#{1,3})\s+(.+)').firstMatch(line);
      if (headingMatch != null) {
        final level = headingMatch.group(1)!.length;
        final content = headingMatch.group(2)!;
        final fontSize = level == 1 ? 16.0 : level == 2 ? 14.5 : 13.5;
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 2),
          child: Text.rich(
            renderMarkdownInline(
              content,
              defaultStyle.copyWith(
                fontSize: fontSize,
                fontWeight: FontWeight.bold,
                color: textColor ?? theme.colorScheme.onSurface,
              ),
            ),
          ),
        ));
        i++;
        continue;
      }

      // Horizontal rule
      if (RegExp(r'^-{3,}$').hasMatch(line.trim())) {
        widgets.add(const Divider(height: 12, thickness: 0.5));
        i++;
        continue;
      }

      // Table: collect all consecutive table rows / separators
      if (_isTableRow(line)) {
        final tableLines = <String>[];
        while (i < lines.length &&
            (_isTableRow(lines[i]) || _isTableSeparator(lines[i]))) {
          tableLines.add(lines[i]);
          i++;
        }

        // First row = header, second row = separator (skip), rest = body
        if (tableLines.isNotEmpty) {
          final headers = _parseTableCells(tableLines[0]);
          final bodyRows = tableLines
              .skip(2) // skip header + separator
              .where((r) => !_isTableSeparator(r))
              .map(_parseTableCells)
              .toList();

          widgets.add(_buildTable(
            context: context,
            headers: headers,
            rows: bodyRows,
            defaultStyle: defaultStyle,
            theme: theme,
          ));
        }
        continue;
      }

      // Unordered list item
      final listMatch = RegExp(r'^[-*]\s+(.+)').firstMatch(line);
      if (listMatch != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 4, top: 1),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 5, right: 6),
                child: Container(
                  width: 4,
                  height: 4,
                  decoration: BoxDecoration(
                    color: defaultStyle.color?.withValues(alpha: 0.7),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              Expanded(
                child: Text.rich(
                  renderMarkdownInline(listMatch.group(1)!, defaultStyle),
                ),
              ),
            ],
          ),
        ));
        i++;
        continue;
      }

      // Blank line → small gap
      if (line.trim().isEmpty) {
        widgets.add(const SizedBox(height: 4));
        i++;
        continue;
      }

      // Regular paragraph
      widgets.add(Text.rich(renderMarkdownInline(line, defaultStyle)));
      i++;
    }

    if (widgets.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: widgets,
    );
  }

  Widget _buildTable({
    required BuildContext context,
    required List<String> headers,
    required List<List<String>> rows,
    required TextStyle defaultStyle,
    required ThemeData theme,
  }) {
    final headerStyle = defaultStyle.copyWith(
      fontWeight: FontWeight.w600,
      fontSize: (defaultStyle.fontSize ?? 13) - 1,
      color: defaultStyle.color?.withValues(alpha: 0.7),
    );
    final cellStyle = defaultStyle.copyWith(
      fontSize: (defaultStyle.fontSize ?? 13) - 1,
    );
    final borderColor = theme.dividerColor.withValues(alpha: 0.4);
    final headerBg = theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5);
    final altRowBg = theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.2);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: borderColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: IntrinsicWidth(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Header row
                  Container(
                    color: headerBg,
                    child: Row(
                      children: List.generate(headers.length, (hi) {
                        return _tableCell(
                          content: headers[hi],
                          style: headerStyle,
                          isHeader: true,
                          borderColor: borderColor,
                          isLast: hi == headers.length - 1,
                        );
                      }),
                    ),
                  ),
                  // Body rows
                  ...rows.asMap().entries.map((entry) {
                    final ri = entry.key;
                    final row = entry.value;
                    return Container(
                      color: ri.isOdd ? altRowBg : null,
                      child: Row(
                        children: List.generate(headers.length, (ci) {
                          final cell = ci < row.length ? row[ci] : '';
                          return _tableCell(
                            content: cell,
                            style: cellStyle,
                            isHeader: false,
                            borderColor: borderColor,
                            isLast: ci == headers.length - 1,
                          );
                        }),
                      ),
                    );
                  }),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _tableCell({
    required String content,
    required TextStyle style,
    required bool isHeader,
    required Color borderColor,
    required bool isLast,
  }) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: 10,
        vertical: isHeader ? 7 : 5,
      ),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : Border(right: BorderSide(color: borderColor, width: 0.5)),
      ),
      child: Text.rich(
        renderMarkdownInline(content, style),
        softWrap: false,
      ),
    );
  }
}
