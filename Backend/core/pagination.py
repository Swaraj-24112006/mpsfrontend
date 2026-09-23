from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsSetPagination(PageNumberPagination):
    """
    Standard pagination for KSPG MPS APIs.
    Supports ?page=N&page_size=M.
    Pass ?paginate=false to retrieve unpaginated results (e.g. for dropdown lists).
    """
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def paginate_queryset(self, queryset, request, view=None):
        if request.query_params.get('paginate') == 'false':
            return None
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data
        })
