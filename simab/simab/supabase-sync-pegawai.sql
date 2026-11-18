-- ============================================================
-- fn_sync_pegawai_bank — catat pegawai baru (NIP belum ada) beserta bank/rekening
-- dari halaman Perbantuan, tanpa Google Sheet.
--  * Hanya MENAMBAH baris baru; baris yang NIP-nya sudah ada TIDAK diubah/ditimpa.
--  * Baris baru masuk ke kantor milik pemanggil.
--  * Mengembalikan daftar pesan untuk baris yang gagal (array teks; kosong = semua aman).
-- Jalankan sekali di SQL Editor Supabase. Aman diulang.
-- ============================================================
create or replace function public.fn_sync_pegawai_bank(p jsonb)
returns jsonb
language plpgsql security definer
set search_path to public
as $$
declare
  it jsonb;
  v_nip text; v_nama text; v_kantor text;
  errs jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'harus login';
  end if;
  v_kantor := public.fn_pegawai_kantor_id();

  for it in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    v_nip  := regexp_replace(coalesce(it->>'nip', ''), '\D', '', 'g');
    v_nama := btrim(coalesce(it->>'nama', ''));
    begin
      if v_nip = '' or v_nama = '' then
        errs := errs || to_jsonb('NIP/nama kosong: ' || coalesce(it->>'nama', '?'));
        continue;
      end if;
      if exists (select 1 from public.pegawai where id = v_nip) then
        continue; -- sudah ada: jangan ditimpa
      end if;
      -- format(%L) menghasilkan literal tak bertipe, jadi cocok dengan tipe kolom apa pun (kepeg dsb.)
      execute format(
        'insert into public.pegawai (id, nama, jabatan, pangkat, kepeg, nama_bank, no_rekening, kantor_id) values (%L,%L,%L,%L,%L,%L,%L,%L)',
        v_nip, v_nama, '', '', coalesce(nullif(it->>'status', ''), '0'),
        coalesce(it->>'namaBank', ''), coalesce(it->>'norek', ''), v_kantor);
    exception when others then
      errs := errs || to_jsonb(v_nama || ': ' || sqlerrm);
    end;
  end loop;
  return errs;
end;
$$;

revoke all on function public.fn_sync_pegawai_bank(jsonb) from public, anon;
grant execute on function public.fn_sync_pegawai_bank(jsonb) to authenticated;
