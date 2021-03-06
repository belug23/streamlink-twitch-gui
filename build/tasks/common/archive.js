function tarGzipArchive({ input, prefix, output, now }) {
	return [
		// make sure that GNU tar is being used
		"tar --version | grep 'GNU tar' >/dev/null",
		// go into input dir
		`&& cd '${input}'`,
		// include all files from the input dir
		"&& find . -type f -print0 | LC_ALL=C sort -z",
		// deterministic archive: explicitly set mtime and owner/group IDs+perms
		// https://wiki.debian.org/ReproducibleBuilds/TimestampsInTarball
		"| tar --no-recursion --null --files-from -",
		`"--mtime=@\${SOURCE_DATE_EPOCH:-${now}}"`,
		"--numeric-owner --owner=0 --group=0",
		"--mode=go=rX,u+rw,a-s",
		// use --transform feature of GNU tar to set the custom prefix path
		// set flags=r to ignore prefix when archiving symlinks
		// https://stackoverflow.com/a/29661783
		`--transform 'flags=r;s,^\./,${prefix}/,'`,
		// PAX headers
		"--pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime",
		"--create",
		// https://wiki.debian.org/ReproducibleBuilds/TimestampsInGzipHeaders
		"| gzip --no-name --best",
		// finally write the compressed archive's stream to output file
		`> '${output}'`
	].join( " " );
}

function zipArchive({ input, prefix, output, now }) {
	return [
		// create and go into a temp dir
		"cd \"$(mktemp --directory)\"",
		// create the archive's prefix
		`&& mkdir '${prefix}'`,
		`&& cp -a '${input}/.' '${prefix}/'`,
		// fix file permissions
		"&& find . -type d -exec chmod 0755 '{}' '+'",
		"&& find . -type f -exec chmod 0644 '{}' '+'",
		// deterministic archive: update the mtime of all dirs and files and the prefix
		// https://wiki.debian.org/ReproducibleBuilds/TimestampsInZip
		`&& find . -exec touch --no-dereference "--date=@\${SOURCE_DATE_EPOCH:-${now}}" '{}' '+'`,
		// include all files from the input dir via the prefix (mind the trailing /)
		`&& find '${prefix}/' | LC_ALL=C sort`,
		// create the compressed archive and write to the output file
		`| TZ=UTC zip --quiet --latest-time -9 -X -@ '${output}'`,
		// lastly remove the prefix and temp dir again
		`&& rm -rf '${prefix}'`,
		"&& rmdir \"$PWD\""
	].join( " " );
}


module.exports = function( target, type ) {
	let method;
	switch ( type ) {
		case "tgz":
			method = tarGzipArchive;
			break;
		case "zip":
			method = zipArchive;
			break;
		default:
			throw new Error( `Invalid archive type for '${target}': ${type}` );
	}

	return {
		options: {
			preferLocal: false
		},
		command: () => method({
			input: `<%= compress.${target}.input %>`,
			prefix: `<%= compress.${target}.prefix %>`,
			output: `<%= compress.${target}.output %>`,
			now: Math.floor( Date.now() / 1000 )
		})
	};
};
