import 'package:flutter/material.dart';

class Tag {
  final String name;
  final String value;

  Tag({required this.name, required this.value});
}

class TagItem extends StatelessWidget {
  final Tag tag;
  final void Function(Tag tag)? onTap;
  final bool checked;
  const TagItem({
    super.key,
    required this.tag,
    required this.checked,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (onTap != null) {
          onTap!(tag);
        }
      },
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: checked
                  ? Theme.of(context).colorScheme.onSurface
                  : Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              tag.name,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: checked
                    ? Theme.of(context).colorScheme.onInverseSurface
                    : Theme.of(context).colorScheme.onSurface,
              ),
            ),
          ),
          SizedBox(width: 16),
        ],
      ),
    );
  }
}

class TagList extends StatefulWidget {
  final List<Tag> tags;
  final void Function(Tag tag)? onTap;
  final Tag? currentTag;

  const TagList({super.key, required this.tags, this.currentTag, this.onTap});

  @override
  State<TagList> createState() => _TagListState();
}

class _TagListState extends State<TagList> {
  bool _isChecked(Tag tag) {
    return widget.currentTag?.value == tag.value;
  }

  @override
  void didUpdateWidget(TagList oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentTag?.value != oldWidget.currentTag?.value) {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final tag in widget.tags)
            TagItem(tag: tag, onTap: widget.onTap, checked: _isChecked(tag)),
        ],
      ),
    );
  }
}
