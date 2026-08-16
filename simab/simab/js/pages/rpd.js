<div class="ios-panel p-5">
    <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-slate-700">
            <i class="fa-solid fa-table mr-2 text-sky-500"></i>Tabel Rencana Penarikan Dana
        </h3>
        <button id="rpd-btn-refresh" onclick="rpdLoadData()" class="text-slate-400 hover:text-sky-600 text-sm" title="Muat ulang">
            <i class="fa-solid fa-rotate-right"></i>
        </button>
    </div>

    <div id="rpd-loading" class="text-center text-slate-400 py-10">
        <i class="fa-solid fa-spinner fa-spin mr-2"></i>Memuat data RPD...
    </div>

    <div id="rpd-error" class="hidden text-center text-red-500 py-10"></div>

    <div id="rpd-wrapper" class="hidden overflow-x-auto">
        <table class="text-sm border-collapse">
            <colgroup>
                <col style="width:90px">
                <col style="width:80px">
                <col style="width:140px">
                <col style="width:140px">
                <col style="width:140px">
                <col style="width:70px">
            </colgroup>
            <thead>
                <tr id="rpd-thead-row" class="bg-slate-50 text-slate-600 text-left"></tr>
            </thead>
            <tbody id="rpd-tbody" class="divide-y divide-slate-100"></tbody>
        </table>
    </div>
</div>
