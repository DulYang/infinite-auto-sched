-- There is only one real court (Practice Half-Court). Remove the
-- placeholder "Main Basketball Court" seed row. No bookings reference it
-- at the time of writing, so this is a plain delete.
delete from bookings where court_id in (select id from courts where name = 'Main Basketball Court');
delete from courts where name = 'Main Basketball Court';
