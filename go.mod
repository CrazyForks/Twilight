module github.com/prejudice-studio/twilight

go 1.23.0

toolchain go1.23.2

require github.com/jackc/pgx/v5 v5.6.0

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20221227161230-091c0ba34f0a // indirect
	github.com/jackc/puddle/v2 v2.2.1 // indirect
	golang.org/x/crypto v0.17.0 // indirect
	golang.org/x/sync v0.15.0 // indirect
	golang.org/x/text v0.26.0 // indirect
)

replace github.com/jackc/pgservicefile => github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761

replace github.com/jackc/puddle/v2 => github.com/jackc/puddle/v2 v2.2.2

replace golang.org/x/crypto => golang.org/x/crypto v0.39.0

replace github.com/stretchr/testify => github.com/stretchr/testify v1.10.0

replace golang.org/x/sync => golang.org/x/sync v0.7.0

replace golang.org/x/text => golang.org/x/text v0.26.0
