"use strict";

let OpenSearchApi = {};
let currentSearchString;
let itemsPerPage;
let currentPage = 1;
let sort;
let sortOrder;
let facets = ['Data_Access_Restriction'];
let filters = {};
let ranges = {};

$(function() {
    itemsPerPage = $('#items-count').val();
    sort = $('#sort').val();
    sortOrder = $("select option:selected").attr('data-order');

    let filter = null;
    if ($("#search-filter").val().length > 0) {
        filter = $("#search-filter").val();
        search(filter, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    }

    $("#search-filter").on('keyup', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) {
            let filter = $("#search-filter").val();
            search(filter, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
        }
    });

    $(".search-btn").click(function() {
        let filter = $("#search-filter").val();
        search(filter, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    });

    $(".search-pagination .next, .search-pagination .previous").click(function() {
        let page = $(this).attr('data-page');
        search(currentSearchString, page, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    });

    $('#items-count').on('change', function() {
        itemsPerPage = $(this).val();
        search(currentSearchString, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    });

    $('#sort').on('change', function() {
        sort = $(this).val();
        sortOrder = $(this).find(":selected").attr('data-order');
        search(currentSearchString, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    });

    $("body").on("change", "input:radio[id=Data_Access_Restriction]", function() {
        if ($(this).val() == '') {
            filters = {};
        } else {
            filters["Data_Access_Restriction"] = $(this).val();
        }
        console.log(filters);

        search(currentSearchString, 1, itemsPerPage, sort, sortOrder, facets, filters, ranges);
    });
});


function search(term, page, itemsPerPage, sort, sortOrder, facets = [], filters=[], ranges = [])
{
    load(true);
    currentSearchString = term;
    currentPage = parseInt(page);

    let reverse = false;
    if (sortOrder == 'desc') {
        reverse = true;
    }

    OpenSearchApi.call(
        {
            value: term,
            from: ((page -1) * itemsPerPage),
            size: itemsPerPage,
            sort: sort,
            reverse: reverse,
            facets: facets,
            filters: filters,
            ranges: ranges
        },
        {'quiet': true, 'rawResult': true}
    ).then((data) => {
        let html = '';
        let results = data.total_matches;
        if (results) {
            buildFacets(data.facets);
            $(data.matches).each(function(index, element) {
                let attr = {};
                $(element.attributes).each(function(index, attribute) {
                    attr[attribute.name] = attribute.value;
                });
                html += itemTemplate(attr);
            });
        } else {
            $('.no-results .search-term').text(term);
        }
        buildPagination(results);
        $('#search-results').html(html);
        load(false, results);
    });
}

function load(loading = true, results = true)
{
    if (loading) {
        $('.search-btn').html('<i class="fa-solid fa-spinner fa-spin-pulse"></i>');
    } else {
        $('.search-btn').html('<i class="fa fa-search"></i>');

        if (results) {
            $('.no-results').addClass('hide');
            $('.content, .search-pagination').removeClass('hide');
        } else {
            $('.content, .search-pagination').addClass('hide');
            $('.no-results').removeClass('hide');
        }
    }
}

function itemTemplate(data)
{
    let access;
    if(data.Data_Access_Restriction.substring(0, 4) == 'Open') {
        access = `
        <span class="badge rounded-pill bg-success">
            <i class="fa-solid fa-lock-open"></i> Open
        </span>`;
    } else {
        access = `
        <span class="badge rounded-pill bg-warning">
            <i class="fa-solid fa-lock"></i> Restricted
        </span>`;
    }
    let description = truncate(data.Description, 265, '...');

    let date = '';
    if ('Creation_Time' in data) {
        date = formatDate(data.Creation_Time * 1000);
    }

    let html = `
    <div class="card mb-3 search-result border-0 border-bottom rounded-0">
        <div class="card-body p-0 pb-3">
            <div class="card-title">
                <span class="title-text"><a href="/vault/yoda/${data.Data_Package_Reference}">${data.Title}</a></span>
                ${access}
            </div>
            <h6 class="card-subtitle mb-2 text-muted">
                <span>${data.Creator} (${data.Owner_Role})</span>
                <span class="float-end">${date}</span>
            </h6>
            <p class="card-text">
                ${description}
            </p>
        </div>
    </div>
    `;
    return html;
}

function radioItem(value, count, checked = false) {
    let checkedHtml = '';
    if (checked) {
        checkedHtml = 'checked';
    }

    let html = `    
    <div class="form-check">
        <input class="form-check-input" type="radio" value="${value}"  name="filters['Data_Access_Restriction']" id="Data_Access_Restriction" ${checkedHtml}>
        <label class="form-check-label" for="Data_Access_Restriction">
          ${value} (${count})
        </label>
    </div>
    `;
    return html;
}

function truncate(str, max, suffix) {
    if (str.length < max) {
        return str;
    } else {
        return str.substring(0, max) + suffix;
    }
}

function formatDate(timestamp) {
    let d = new Date(timestamp);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2)
        month = '0' + month;
    if (day.length < 2)
        day = '0' + day;

    return [year, month, day].join('-');
}

function buildPagination(totalItems)
{
    if (totalItems) {
        let totalPages = Math.ceil((totalItems / itemsPerPage));

        // previous button
        if (currentPage == 1) {
            $('.search-pagination .previous').addClass('disabled');
        } else {
            $('.search-pagination .previous').attr('data-page', (currentPage - 1));
            $('.search-pagination .previous').removeClass('disabled');
        }

        // next button
        if (currentPage >= totalPages) {
            $('.search-pagination .next').addClass('disabled');
        } else {
            $('.search-pagination .next').attr('data-page', (currentPage + 1));
            $('.search-pagination .next').removeClass('disabled');
        }
    }

    $('.paging-info').text(totalItems + ' result(s)');
}

function buildFacets(facets)
{
    let html = '';
    let checked = false;
    var filterValue = '';

    if (filters.hasOwnProperty("Data_Access_Restriction")) {
        filterValue = filters.Data_Access_Restriction;
    }

    $(facets.Data_Access_Restriction).each(function(index, facet) {
        $(facet).each(function(index, element) {
            checked = false;
            if (filterValue == element.value) {
                checked = true;
            }
            html += radioItem(element.value, element.count, checked);
        });

        $('.data-access-options').html(html);
    });
}

OpenSearchApi.call = async function(data={}, options={}) {
    // Bare API call.
    let call_ = async (data={}, options={}) => {

        let formData = new FormData();
        // Note: csrf is set in start.php.
        formData.append(Yoda.csrf.tokenName, Yoda.csrf.tokenValue);
        formData.append('data', JSON.stringify(data));

        let errorResult = (msg='Your request could not be completed due to an internal error') =>
            Promise.reject({'data': null, 'status': 'error_internal'});

        try {
            var r = await fetch('/open_search/faceted_query', {
                'method':      'POST',
                'body':        formData,
                'credentials': 'same-origin',
            });
        } catch (error) {
            // Network failure / abort.
            console.error(`API Error: ${error}`);
            return errorResult('Your request could not be completed due to a network connection issue.'
                +' Please try again in a few minutes.');
        }
        if (!((r.status >= 200 && r.status < 300) || r.status == 400 || r.status == 500)) {
            // API responses should either produce 200, 400 or 500.
            // Any other status code indicates an internal error without (human-readable) information.
            console.error(`API Error: HTTP status ${r.status}`);
            return errorResult();
        }
        try {
            var j = await r.json();
        } catch (error) {
            console.error(`API Error: Bad response JSON: ${error}`);
            return errorResult();
        }

        if (j.status === 'ok') {
            return Promise.resolve(j);
        }
        return Promise.reject(j);
    };

    const quiet       = 'quiet'       in options ? options.quiet            : false;
    const errorPrefix = 'errorPrefix' in options ? options.errorPrefix+': ' : '';
    const rawResult   = 'rawResult'   in options ? options.rawResult        : false;

    try {
        let x = await call_(data);
        if (Yoda.version === 'development')
            console.log(`OpenSearch API: result:`, x);
        return rawResult ? x : x.data;
    } catch (x) {
        console.error(`OpenSearch API: failed: `, x);
        if (!quiet) {
            if (Yoda.version === 'development' && 'debug_info' in x)
                Yoda.set_message('error', `${errorPrefix}${x.status} //// debug information: ${x.debug_info}`);
            else
                Yoda.set_message('error', errorPrefix+x.status);
        }
        if (rawResult)
            return x;
        else throw  x;
    }
}