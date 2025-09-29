class PagedData<T> {
  T data;
  int page;
  int pageSize;
  int total;

  PagedData({
    required this.data,
    required this.page,
    required this.pageSize,
    required this.total,
  });
}
