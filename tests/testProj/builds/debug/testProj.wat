(module
	(memory (export "memory") 1)
	(func $main (export "main") (param $x i32) (result i32)
		(local $y i32)
		(block $funcleave (result i32)
		(local.set $y (i32.const 0))
		(block $block_0
		(loop $loop_1
		local.get $y
		i32.const 5
		i32.lt_s
		i32.const 1
		i32.xor
		br_if $block_0
		local.get $y
		i32.const 4
		i32.eq
		if
		local.get $y
		i32.const 1
		i32.add
		(local.set $y)

		end
		local.get $y
		i32.const 1
		i32.add
		(local.set $y)
		br $loop_1
		)
		)
		local.get $y
		br $funcleave
		)
	)
)